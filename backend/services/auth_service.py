"""
Google OAuth 2.0 + JWT 인증 서비스
"""
import os
from datetime import datetime, timedelta
from urllib.parse import urlencode

import httpx
from jose import JWTError, jwt

from db.database import get_db

# ── 환경변수 ──────────────────────────────────────────────────────────────────
GOOGLE_CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
OAUTH_REDIRECT_URI   = os.getenv("OAUTH_REDIRECT_URI", "http://localhost:8000/auth/google/callback")
FRONTEND_URL         = os.getenv("FRONTEND_URL", "http://localhost:3000")
JWT_SECRET_KEY       = os.getenv("JWT_SECRET_KEY", "changeme")
JWT_EXPIRE_MINUTES   = int(os.getenv("JWT_EXPIRE_MINUTES", 480))
JWT_ALGORITHM        = "HS256"
COOKIE_NAME          = "access_token"

# 허용 이메일 (쉼표 구분)
ALLOWED_EMAILS: set[str] = {
    e.strip() for e in os.getenv("ALLOWED_EMAIL", "").split(",") if e.strip()
}
# 관리자 이메일 (쉼표 구분)
ADMIN_EMAILS: set[str] = {
    e.strip() for e in os.getenv("ADMIN_EMAIL", "").split(",") if e.strip()
}

# ── Google OAuth 엔드포인트 ───────────────────────────────────────────────────
GOOGLE_AUTH_URL     = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL    = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


# ── Google OAuth 헬퍼 ─────────────────────────────────────────────────────────

def build_google_auth_url() -> str:
    """Google 로그인 페이지 URL 생성"""
    params = {
        "client_id":     GOOGLE_CLIENT_ID,
        "redirect_uri":  OAUTH_REDIRECT_URI,
        "response_type": "code",
        "scope":         "openid email profile",
        "access_type":   "offline",
        "prompt":        "select_account",   # 계정 선택 화면 항상 표시
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


async def exchange_code_for_token(code: str) -> dict:
    """Authorization code → Google access token"""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code":          code,
                "client_id":     GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri":  OAUTH_REDIRECT_URI,
                "grant_type":    "authorization_code",
            },
        )
        resp.raise_for_status()
        return resp.json()


async def get_google_userinfo(access_token: str) -> dict:
    """Google UserInfo API → 사용자 정보 (email, name, picture 등)"""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        return resp.json()


# ── 접근 제어 ─────────────────────────────────────────────────────────────────

def is_allowed(email: str) -> bool:
    """허용된 이메일 목록에 포함되어 있는지 확인"""
    return email in ALLOWED_EMAILS


def resolve_role(email: str) -> str:
    """이메일에 따라 역할 결정: admin 목록이면 'admin', 아니면 'user'"""
    return "admin" if email in ADMIN_EMAILS else "user"


# ── DB 사용자 관리 ────────────────────────────────────────────────────────────

def upsert_user(email: str, name: str) -> dict:
    """
    사용자 upsert:
    - 없으면 INSERT (role은 ADMIN_EMAILS 기준으로 결정)
    - 있으면 name, last_login 갱신 (role은 유지)
    """
    role = resolve_role(email)
    with get_db() as (conn, cur):
        cur.execute(
            """
            INSERT INTO users (email, name, role)
            VALUES (%s, %s, %s)
            ON CONFLICT (email) DO UPDATE
              SET name       = EXCLUDED.name,
                  last_login = NOW()
            RETURNING id, email, name, role
            """,
            (email, name, role),
        )
        return dict(cur.fetchone())


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_jwt(user: dict) -> str:
    """사용자 정보를 담은 JWT 발급"""
    payload = {
        "sub":   str(user["id"]),
        "email": user["email"],
        "name":  user["name"],
        "role":  user["role"],
        "exp":   datetime.utcnow() + timedelta(minutes=JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def verify_jwt(token: str) -> dict:
    """JWT 검증 → payload 반환. 실패 시 JWTError raise"""
    return jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
