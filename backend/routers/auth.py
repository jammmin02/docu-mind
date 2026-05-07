"""
인증 라우터 — Google OAuth 2.0 + JWT (httpOnly 쿠키)

흐름:
  1. GET /auth/login          → Google 로그인 페이지로 리다이렉트
  2. GET /auth/google/callback → code 교환 → 사용자 upsert → JWT 쿠키 발급 → 프론트 리다이렉트
  3. POST /auth/logout         → JWT 쿠키 삭제
  4. GET /auth/me              → JWT 검증 → 사용자 정보 반환
"""

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import JSONResponse, RedirectResponse
from jose import JWTError

from services.auth_service import (
    COOKIE_NAME,
    FRONTEND_URL,
    build_google_auth_url,
    create_jwt,
    exchange_code_for_token,
    get_google_userinfo,
    is_allowed,
    upsert_user,
    verify_jwt,
)

router = APIRouter(prefix="/auth", tags=["auth"])


# ── 1. 로그인 ─────────────────────────────────────────────────────────────────

@router.get("/login")
def login():
    """Google OAuth 로그인 페이지로 리다이렉트"""
    return RedirectResponse(url=build_google_auth_url())


# ── 2. OAuth 콜백 ─────────────────────────────────────────────────────────────

@router.get("/google/callback")
async def google_callback(code: str | None = None, error: str | None = None):
    """
    Google이 리다이렉트해주는 콜백 엔드포인트
    성공: JWT 쿠키 발급 후 프론트엔드 메인으로 이동
    실패: 프론트엔드 로그인 페이지로 에러와 함께 이동
    """
    # Google이 error 파라미터를 보낸 경우 (사용자가 취소 등)
    if error or not code:
        return RedirectResponse(
            url=f"{FRONTEND_URL}/login?error=oauth_cancelled",
            status_code=status.HTTP_302_FOUND,
        )

    try:
        # ① code → access_token
        token_data   = await exchange_code_for_token(code)
        access_token = token_data.get("access_token")
        if not access_token:
            raise ValueError("access_token 없음")

        # ② access_token → 사용자 정보
        user_info = await get_google_userinfo(access_token)
        email     = user_info.get("email", "")
        name      = user_info.get("name", email)

        # ③ 접근 허용 여부 확인
        if not is_allowed(email):
            return RedirectResponse(
                url=f"{FRONTEND_URL}/login?error=not_allowed",
                status_code=status.HTTP_302_FOUND,
            )

        # ④ DB upsert
        user = upsert_user(email, name)

        # ⑤ JWT 발급
        jwt_token = create_jwt(user)

    except Exception:
        return RedirectResponse(
            url=f"{FRONTEND_URL}/login?error=server_error",
            status_code=status.HTTP_302_FOUND,
        )

    # ⑥ httpOnly 쿠키에 JWT 저장 후 프론트 메인으로 이동
    response = RedirectResponse(
        url=FRONTEND_URL,
        status_code=status.HTTP_302_FOUND,
    )
    response.set_cookie(
        key=COOKIE_NAME,
        value=jwt_token,
        httponly=True,      # JS에서 접근 불가 (XSS 방어)
        samesite="lax",     # CSRF 기본 방어
        secure=False,       # 로컬 개발용 (운영은 True + HTTPS)
        max_age=60 * 60 * 8,  # 8시간
        path="/",
    )
    return response


# ── 3. 로그아웃 ───────────────────────────────────────────────────────────────

@router.post("/logout")
def logout():
    """JWT 쿠키 삭제"""
    response = JSONResponse(content={"message": "로그아웃 되었습니다"})
    response.delete_cookie(key=COOKIE_NAME, path="/")
    return response


# ── 4. 내 정보 조회 ───────────────────────────────────────────────────────────

@router.get("/me")
def me(request: Request):
    """
    JWT 쿠키 검증 후 사용자 정보 반환
    쿠키가 없거나 만료된 경우 401 반환
    """
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="로그인이 필요합니다",
        )

    try:
        payload = verify_jwt(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않거나 만료된 토큰입니다",
        )

    return {
        "id":    payload["sub"],
        "email": payload["email"],
        "name":  payload["name"],
        "role":  payload["role"],
    }
