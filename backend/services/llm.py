"""
Claude API 스트리밍 서비스
- SSE 스트리밍
- 토큰 버짓 관리 (히스토리 트리밍)
- RAG 프롬프트 구성
"""
import os
import logging
from typing import List, Dict, Any, AsyncGenerator

import anthropic
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

# ── 토큰 버짓 설정 ─────────────────────────────────────────────────────────────
MODEL            = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-5")
MAX_OUTPUT_TOKENS = 1500

# 입력 토큰 버짓 (합계가 이 값을 넘지 않도록 히스토리를 트리밍)
BUDGET_TOTAL    = 8000   # 전체 입력 토큰 한도
BUDGET_SYSTEM   = 400    # 시스템 프롬프트 (고정)
BUDGET_CONTEXT  = 2000   # RAG 컨텍스트
BUDGET_HISTORY  = 3000   # 대화 히스토리
BUDGET_QUERY    = 400    # 현재 질문

SYSTEM_PROMPT = """당신은 업로드된 문서를 기반으로 정확한 답변을 제공하는 전문 AI 어시스턴트입니다.

답변 규칙:
1. 반드시 아래 [참고 문서] 내용을 근거로 답변하세요.
2. 문서에 없는 내용은 "문서에서 해당 정보를 찾을 수 없습니다"라고 명시하세요.
3. 답변은 명확하고 구조적으로 작성하세요.
4. 출처가 있는 경우 어떤 문서의 내용인지 언급하세요.
5. 한국어로 답변하세요."""


def estimate_tokens(text: str) -> int:
    """간단한 토큰 수 추정 (한국어: 3자≈1토큰, 영어: 4자≈1토큰)"""
    korean_chars = sum(1 for c in text if '가' <= c <= '힣')
    other_chars  = len(text) - korean_chars
    return max(1, korean_chars // 3 + other_chars // 4)


def trim_history(
    history: List[Dict[str, str]],
    budget: int = BUDGET_HISTORY,
) -> List[Dict[str, str]]:
    """
    토큰 예산 내에서 최신 메시지 우선으로 히스토리 트리밍.
    항상 user/assistant 쌍이 유지되도록 짝수 단위로 자름.
    """
    if not history:
        return []

    # 최신 메시지부터 역순으로 쌓다가 예산 초과 시 중단
    used  = 0
    kept  = []
    pairs = list(zip(history[::2], history[1::2]))  # (user, assistant) 쌍

    for user_msg, asst_msg in reversed(pairs):
        cost = estimate_tokens(user_msg["content"]) + estimate_tokens(asst_msg["content"])
        if used + cost > budget:
            break
        kept.insert(0, user_msg)
        kept.insert(1, asst_msg)
        used += cost

    logger.debug(f"[llm] history trimmed: {len(history)} → {len(kept)} msgs (~{used} tokens)")
    return kept


def build_messages(
    query: str,
    context: str,
    history: List[Dict[str, str]],
) -> List[Dict[str, str]]:
    """
    Claude API messages 배열 구성.
    [히스토리...] + [현재 질문(컨텍스트 포함)]
    """
    trimmed = trim_history(history)

    # 현재 질문에 RAG 컨텍스트 첨부
    user_content = f"[참고 문서]\n{context}\n\n[질문]\n{query}" if context.strip() else query

    messages = trimmed + [{"role": "user", "content": user_content}]
    return messages


async def stream_chat(
    query: str,
    context: str,
    history: List[Dict[str, str]],
) -> AsyncGenerator[str, None]:
    """
    Claude API 스트리밍 호출 → 토큰 단위 AsyncGenerator.

    Yields:
        텍스트 토큰 문자열 (빈 문자열이면 스트림 종료)
    """
    messages = build_messages(query, context, history)

    logger.info(f"[llm] streaming model={MODEL} msgs={len(messages)}")

    try:
        with client.messages.stream(
            model=MODEL,
            max_tokens=MAX_OUTPUT_TOKENS,
            system=SYSTEM_PROMPT,
            messages=messages,
        ) as stream:
            for text in stream.text_stream:
                yield text

    except anthropic.RateLimitError:
        logger.warning("[llm] rate limit hit")
        yield "\n\n[오류: API 요청 한도 초과. 잠시 후 다시 시도해주세요.]"

    except anthropic.AuthenticationError:
        logger.error("[llm] invalid API key")
        yield "\n\n[오류: API 키가 유효하지 않습니다.]"

    except anthropic.APIConnectionError:
        logger.error("[llm] connection error")
        yield "\n\n[오류: Claude API 연결에 실패했습니다.]"

    except Exception as e:
        logger.error(f"[llm] unexpected error: {e}")
        yield f"\n\n[오류: {str(e)[:100]}]"
