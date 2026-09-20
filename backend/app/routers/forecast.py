from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import DB, CurrentUser
from app.models import ForecastScenario
from app.schemas.common import Message
from app.schemas.forecast import (
    ForecastRequest,
    ForecastResponse,
    ScenarioComparison,
    ScenarioCreate,
    ScenarioOut,
    ScenarioUpdate,
)
from app.services.budgets import budget_overview
from app.services.forecast import build_forecast
from app.services.finance import month_bounds

router = APIRouter(prefix="/forecast", tags=["forecast"])


def _run(db, user_id: uuid.UUID, payload: ForecastRequest) -> ForecastResponse:
    today = date.today()
    start, end = month_bounds(today)
    budgets = budget_overview(db, user_id, start, end, today)
    result = build_forecast(
        db,
        user_id,
        today,
        payload.horizon_months,
        adjustments=[a.model_dump() for a in payload.adjustments],
        income_override=payload.monthly_income_override,
        expense_override=payload.monthly_expense_override,
        budgeted_monthly_expense=budgets["total_limit"],
    )
    return ForecastResponse(**result)


@router.post("", response_model=ForecastResponse)
def run_forecast(payload: ForecastRequest, db: DB, user: CurrentUser) -> ForecastResponse:
    return _run(db, user.id, payload)


@router.get("/scenarios", response_model=list[ScenarioOut])
def list_scenarios(db: DB, user: CurrentUser) -> list[ForecastScenario]:
    return list(
        db.scalars(
            select(ForecastScenario)
            .where(ForecastScenario.deleted_at.is_(None), ForecastScenario.user_id == user.id)
            .order_by(ForecastScenario.created_at.desc())
        ).all()
    )


@router.post("/scenarios", response_model=ScenarioOut, status_code=status.HTTP_201_CREATED)
def create_scenario(payload: ScenarioCreate, db: DB, user: CurrentUser) -> ForecastScenario:
    scenario = ForecastScenario(
        name=payload.name,
        horizon_months=payload.horizon_months,
        adjustments={"items": [a.model_dump(mode="json") for a in payload.adjustments]},
        user_id=user.id,
    )
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    return scenario


@router.patch("/scenarios/{scenario_id}", response_model=ScenarioOut)
def update_scenario(
    scenario_id: uuid.UUID, payload: ScenarioUpdate, db: DB, user: CurrentUser
) -> ForecastScenario:
    scenario = _get(db, scenario_id, user.id)
    data = payload.model_dump(exclude_unset=True)
    if "adjustments" in data and data["adjustments"] is not None:
        scenario.adjustments = {
            "items": [a.model_dump(mode="json") for a in (payload.adjustments or [])]
        }
        data.pop("adjustments")
    for key, value in data.items():
        setattr(scenario, key, value)
    db.commit()
    db.refresh(scenario)
    return scenario


@router.delete("/scenarios/{scenario_id}", response_model=Message)
def delete_scenario(scenario_id: uuid.UUID, db: DB, user: CurrentUser) -> Message:
    scenario = _get(db, scenario_id, user.id)
    scenario.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return Message(detail="Scenario removed")


@router.get("/scenarios/{scenario_id}/compare", response_model=ScenarioComparison)
def compare(scenario_id: uuid.UUID, db: DB, user: CurrentUser) -> ScenarioComparison:
    """Run the same horizon with and without a scenario's adjustments."""
    scenario = _get(db, scenario_id, user.id)
    items = scenario.adjustments.get("items", []) if isinstance(scenario.adjustments, dict) else []
    base = _run(db, user.id, ForecastRequest(horizon_months=scenario.horizon_months))
    with_scenario = _run(
        db,
        user.id,
        ForecastRequest.model_validate(
            {"horizon_months": scenario.horizon_months, "adjustments": items}
        ),
    )
    return ScenarioComparison(
        base=base,
        scenario=with_scenario,
        end_balance_delta=with_scenario.projected_end_balance - base.projected_end_balance,
        savings_delta=with_scenario.total_projected_savings - base.total_projected_savings,
    )


def _get(db, scenario_id: uuid.UUID, user_id: uuid.UUID) -> ForecastScenario:
    scenario = db.get(ForecastScenario, scenario_id)
    if scenario is None or scenario.deleted_at is not None or scenario.user_id != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Scenario not found")
    return scenario
