"""
OpenAI text-embedding-3-large 임베딩 서비스
지수 백오프 재시도 + 배치 처리 + per-request timeout
"""
import os
import time
import logging
from typing import List

from openai import (
    OpenAI,
    RateLimitError,
    APIConnectionError,
    APITimeoutError,
    APIStatusError,
    AuthenticationError,
)
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

# timeout: 단일 API 요청 최대 대기 시간 (초)
# max_retries=0: 자체 재시도 로직을 사용하므로 SDK 내장 재시도 비활성화
client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY"),
    timeout=30.0,
    max_retries=0,
)

BATCH_SIZE   = int(os.getenv("EMBEDDING_BATCH_SIZE",  100))
MAX_RETRIES  = int(os.getenv("EMBEDDING_MAX_RETRIES",   3))
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-large")
EMBEDDING_DIMENSIONS = int(os.getenv("EMBEDDING_DIMENSIONS", 1536))
RETRY_DELAYS = [3, 10, 30]  # 초: 1차 → 2차 → 3차 (이전보다 조금 더 여유 있게)


def embed_with_retry(texts: List[str]) -> List[List[float]]:
    """
    단일 배치 임베딩.
    - RateLimitError / APIConnectionError / APITimeoutError → 재시도
    - APIStatusError 5xx → 재시도, 4xx → 즉시 실패
    - AuthenticationError → 즉시 실패 (재시도 의미 없음)
    """
    for attempt in range(MAX_RETRIES):
        try:
            response = client.embeddings.create(
                model=EMBEDDING_MODEL,
                input=texts,
                dimensions=EMBEDDING_DIMENSIONS,
            )
            return [item.embedding for item in response.data]

        except (RateLimitError, APIConnectionError, APITimeoutError) as e:
            if attempt == MAX_RETRIES - 1:
                raise
            delay = RETRY_DELAYS[attempt]
            logger.warning(
                "[embed] 일시적 오류(%s) — 재시도 %d/%d, %d초 후",
                type(e).__name__, attempt + 1, MAX_RETRIES, delay,
            )
            time.sleep(delay)

        except APIStatusError as e:
            # 5xx 서버 오류는 재시도, 4xx 클라이언트 오류는 즉시 실패
            if e.status_code >= 500 and attempt < MAX_RETRIES - 1:
                delay = RETRY_DELAYS[attempt]
                logger.warning(
                    "[embed] 서버 오류(%d) — 재시도 %d/%d, %d초 후",
                    e.status_code, attempt + 1, MAX_RETRIES, delay,
                )
                time.sleep(delay)
            else:
                raise

        except AuthenticationError:
            raise  # API 키 오류는 재시도 불필요


def embed_chunks(chunks: List[str]) -> List[List[float]]:
    """전체 청크 리스트를 배치 단위로 임베딩"""
    all_embeddings: List[List[float]] = []

    for i in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[i:i + BATCH_SIZE]
        embeddings = embed_with_retry(batch)
        all_embeddings.extend(embeddings)

        # 마지막 배치가 아니면 Rate Limit 여유 확보
        if i + BATCH_SIZE < len(chunks):
            time.sleep(0.5)

    return all_embeddings


def embed_query(query: str) -> List[float]:
    """단일 쿼리 임베딩 (RAG 검색용)"""
    result = embed_with_retry([query])
    return result[0]
