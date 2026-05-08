"""
Rate Limiter 싱글턴 — slowapi 기반

사용법:
    from limiter import limiter
    from fastapi import Request

    @router.post("/something")
    @limiter.limit("10/minute")
    async def endpoint(request: Request, ...):
        ...

main.py에서 app.state.limiter = limiter 및 예외 핸들러 등록 필요.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

# IP 기반 제한 (리버스 프록시 환경이면 X-Real-IP / X-Forwarded-For 헤더 사용)
limiter = Limiter(key_func=get_remote_address)
