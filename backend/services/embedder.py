"""
OpenAI text-embedding-3-small 임베딩 서비스
지수 백오프 재시도 + 배치 처리
"""
import os
import time
import logging
from typing import List

from openai import OpenAI, RateLimitError, APIConnectionError, AuthenticationError
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

BATCH_SIZE  = int(os.getenv("EMBEDDING_BATCH_SIZE",  100))
MAX_RETRIES = int(os.getenv("EMBEDDING_MAX_RETRIES",   3))
RETRY_DELAYS = [2, 8, 30]   # 초: 1차 → 2차 → 3차


def embed_with_retry(texts: List[str]) -> List[List[float]]:
    """단일 배치 임베딩 — 일시적 오류는 재시도, 영구 오류는 즉시 실패"""
    for attempt in range(MAX_RETRIES):
        try:
            response = client.embeddings.create(
                model="text-embedding-3-small",
                input=texts,
            )
            return [item.embedding for item in response.data]

        except RateLimitError:
            if attempt == MAX_RETRIES - 1:
                raise
            logger.warning(f"Rate limit hit, retry {attempt + 1}/{MAX_RETRIES} after {RETRY_DELAYS[attempt]}s")
            time.sleep(RETRY_DELAYS[attempt])

        except APIConnectionError:
            if attempt == MAX_RETRIES - 1:
                raise
            logger.warning(f"Connection error, retry {attempt + 1}/{MAX_RETRIES}")
            time.sleep(RETRY_DELAYS[attempt])

        except AuthenticationError:
            # API 키 오류는 재시도 의미 없음
            raise


def embed_chunks(chunks: List[str]) -> List[List[float]]:
    """전체 청크 리스트를 배치 단위로 임베딩"""
    all_embeddings: List[List[float]] = []

    for i in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[i:i + BATCH_SIZE]
        embeddings = embed_with_retry(batch)
        all_embeddings.extend(embeddings)

        # 마지막 배치가 아니면 레이트 리밋 여유 확보
        if i + BATCH_SIZE < len(chunks):
            time.sleep(0.5)

    return all_embeddings


def embed_query(query: str) -> List[float]:
    """단일 쿼리 임베딩 (RAG 검색용)"""
    result = embed_with_retry([query])
    return result[0]
