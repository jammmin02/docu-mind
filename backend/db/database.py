import os
import psycopg
from psycopg.rows import dict_row
from contextlib import contextmanager
from dotenv import load_dotenv

load_dotenv()

DB_CONFIG = {
    "host":     os.getenv("DB_HOST", "localhost"),
    "port":     int(os.getenv("DB_PORT", 5432)),
    "dbname":   os.getenv("DB_NAME", "ragdb"),
    "user":     os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", ""),
}


def get_connection():
    """DB 연결 반환"""
    return psycopg.connect(**DB_CONFIG, row_factory=dict_row)


@contextmanager
def get_db():
    """
    with get_db() as (conn, cur): 형태로 사용
    자동 commit/rollback + 연결 반환
    """
    conn = get_connection()
    cur = conn.cursor()
    try:
        yield conn, cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def check_db_connection() -> bool:
    """헬스체크용 DB 연결 확인"""
    try:
        with get_db() as (conn, cur):
            cur.execute("SELECT 1")
        return True
    except Exception:
        return False
