"""Model routing + budget guard.

Keeps you inside your monthly budget by:
1. Defaulting every turn to the CHEAP model.
2. Escalating to the STRONG model only when the task looks hard, AND only if
   there's strong-model budget left this month.
3. Recording the cost of every call so the budget guard actually works.

Prices are approximate per-1M-token (USD) and only used for budget math; they
do not need to be exact. Update them when OpenRouter pricing changes.
"""
import os

from memory import record_spend, spend_this_month

CHEAP = os.getenv("ALFRED_MODEL_CHEAP", "deepseek/deepseek-v4-flash")
STRONG = os.getenv("ALFRED_MODEL_STRONG", "anthropic/claude-opus-4-8")
BUDGET = float(os.getenv("ALFRED_MONTHLY_BUDGET_USD", "100"))
STRONG_FRACTION = float(os.getenv("ALFRED_STRONG_BUDGET_FRACTION", "0.7"))

# (input_per_1M, output_per_1M) — rough, for budget accounting only.
PRICES = {
    CHEAP: (0.14, 0.28),
    STRONG: (5.00, 25.00),
}

# Signals that a turn deserves the strong model.
_HARD_HINTS = (
    "plan", "architect", "design", "debug", "refactor", "analyze", "strategy",
    "write the code", "build", "complex", "why isn't", "trade-off", "decide",
)


def choose_model(user_text: str, force_strong: bool = False) -> str:
    """Pick CHEAP or STRONG for this turn, respecting the budget."""
    spent = spend_this_month()
    strong_cap = BUDGET * STRONG_FRACTION

    wants_strong = force_strong or _looks_hard(user_text)
    if wants_strong and spent < strong_cap:
        return STRONG
    # Out of strong budget, or routine turn -> cheap model keeps Alfred alive.
    return CHEAP


def _looks_hard(text: str) -> bool:
    t = text.lower()
    if len(t) > 800:  # long, detailed asks tend to need the strong model
        return True
    return any(h in t for h in _HARD_HINTS)


def account(model: str, usage) -> float:
    """Record spend for a completed call. `usage` is the OpenAI usage object."""
    pin, pout = PRICES.get(model, (1.0, 1.0))
    pt = getattr(usage, "prompt_tokens", 0) or 0
    ct = getattr(usage, "completion_tokens", 0) or 0
    usd = (pt / 1_000_000) * pin + (ct / 1_000_000) * pout
    record_spend(model, usd)
    return usd


def budget_status() -> dict:
    spent = spend_this_month()
    return {
        "monthly_budget_usd": BUDGET,
        "spent_30d_usd": round(spent, 4),
        "remaining_usd": round(BUDGET - spent, 4),
        "strong_model_available": spent < BUDGET * STRONG_FRACTION,
    }
