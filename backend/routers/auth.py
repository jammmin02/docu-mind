from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/login")
def login():
    """Google OAuth 로그인 URL로 리다이렉트"""
    # TODO: Google OAuth URL 생성
    raise HTTPException(status_code=501, detail="OAuth 미구현 — 백엔드 연결 후 구현 예정")


@router.get("/callback")
def oauth_callback(code: str):
    """Google OAuth 콜백 — JWT 발급"""
    # TODO: code → access_token → 이메일 확인 → JWT 발급
    raise HTTPException(status_code=501, detail="OAuth 미구현")


@router.post("/logout")
def logout():
    """로그아웃"""
    # TODO: 쿠키 삭제
    return {"message": "로그아웃 되었습니다"}


@router.get("/me")
def me():
    """현재 로그인 사용자 정보"""
    # TODO: JWT 검증 후 사용자 정보 반환
    # 개발 중에는 임시 응답 반환
    return {"id": "dev", "email": "dev@local", "name": "개발자", "role": "admin"}
