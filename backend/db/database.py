"""
DB 연결 모듈 — psycopg3 ConnectionPool 기반

요청마다 새 연결을 생성하지 않고 풀에서 빌려 사용한 뒤 반납.
풀 크기: DB_POOL_MIN(기본 2) ~ DB_POOL_MAX(기본 10) 환경변수로 조정 가능.
"""
import os
import threading
import logging
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

# ── 연결 설정 ─────────────────────────────────────────────────────────────────
_CONNINFO = (
    f"host={os.getenv('DB_HOST', 'localhost')} "
    f"port={os.getenv('DB_PORT', '5432')} "
    f"dbname={os.getenv('DB_NAME', 'ragdb')} "
    f"user={os.getenv('DB_USER', 'postgres')} "
    f"password={os.getenv('DB_PASSWORD', '')}"
)
_POOL_MIN = int(os.getenv("DB_POOL_MIN", 2))
_POOL_MAX = int(os.getenv("DB_POOL_MAX", 10))

# ── 풀 싱글턴 (Double-checked locking) ───────────────────────────────────────
_pool: ConnectionPool | None = None
_lock = threading.Lock()


def _get_pool() -> ConnectionPool:
    """커넥션 풀 싱글턴 반환 (최초 호출 시 생성)"""
    global _pool
    if _pool is None:
        with _lock:
            if _pool is None:
                logger.info(
                    "[db] ConnectionPool 초기화: min=%d max=%d", _POOL_MIN, _POOL_MAX
                )
                _pool = ConnectionPool(
                    _CONNINFO,
                    min_size=_POOL_MIN,
                    max_size=_POOL_MAX,
                    kwargs={"row_factory": dict_row},
                    open=True,
                )
    return _pool


def close_pool() -> None:
    """앱 종료 시 풀 반납 (FastAPI lifespan에서 호출)"""
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None
        logger.info("[db] ConnectionPool 종료")


# ── 컨텍스트 매니저 ───────────────────────────────────────────────────────────

@contextmanager
def get_db():
    """
    with get_db() as (conn, cur): 형태로 사용.
    풀에서 연결을 빌려 자동 commit/rollback 후 반납.
    """
    pool = _get_pool()
    with pool.connection() as conn:
        conn.row_factory = dict_row
        cur = conn.cursor()
        try:
            yield conn, cur
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cur.close()


def check_db_connection() -> bool:
    """헬스체크용 DB 연결 확인"""
    try:
        with get_db() as (conn, cur):
            cur.execute("SELECT 1")
        return True
    except Exception:
        return False
