"""
공통 인증/인가 의존성

사용법:
    from dependencies import get_current_user, require_admin

    @router.get("/something")
    def endpoint(current_user: dict = Depends(get_current_user)):
        ...

    @router.post("/admin-only")
    def admin_endpoint(current_user: dict = Depends(require_admin)):
        ...
"""
from fastapi import Depends, HTTPException, Request, status
from jose import JWTError

from services.auth_service import COOKIE_NAME, verify_jwt


def get_current_user(request: Request) -> dict:
    """
    JWT 쿠키 검증 → 사용자 정보 dict 반환.
    쿠키 없음 → 401 / 토큰 만료·위조 → 401
    반환 dict: {id: int, email: str, name: str, role: str}
    """
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "UNAUTHORIZED", "message": "로그인이 필요합니다", "status": 401}},
        )
    try:
        payload = verify_jwt(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "INVALID_TOKEN", "message": "유효하지 않거나 만료된 토큰입니다", "status": 401}},
        )
    return {
        "id":    int(payload["sub"]),
        "email": payload["email"],
        "name":  payload["name"],
        "role":  payload["role"],
    }


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """
    로그인 + 관리자(role=admin) 검증.
    role != admin → 403
    """
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": "FORBIDDEN", "message": "관리자 권한이 필요합니다", "status": 403}},
        )
    return current_user
