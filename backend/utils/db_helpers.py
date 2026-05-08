"""
DB 공통 헬퍼 유틸

psycopg3가 JSONB 컬럼을 문자열로 반환할 때 Python 리스트/딕셔너리로 변환하는 함수 모음.
"""
import json


def parse_jsonb_fields(row: dict | None, fields: list[str]) -> dict | None:
    """
    지정한 JSONB 컬럼들을 Python 객체로 변환한다.

    사용 예:
        row = parse_jsonb_fields(row, ["business_fields", "main_services"])

    - 값이 str이면 json.loads() 시도
    - 값이 None이면 [] (빈 리스트)로 대체
    - 이미 list/dict이면 그대로 유지
    """
    if row is None:
        return None
    result = dict(row)
    for field in fields:
        val = result.get(field)
        if isinstance(val, str):
            try:
                result[field] = json.loads(val)
            except Exception:
                result[field] = []
        elif val is None:
            result[field] = []
    return result
