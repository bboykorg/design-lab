"""Pydantic request/response schemas."""
from typing import List, Optional, Literal
from pydantic import BaseModel, Field


class AIRequest(BaseModel):
    mode: Literal["scratch", "edit"] = "edit"
    message: str = Field(..., min_length=1, max_length=20000)
    html: str = Field("", max_length=400000)
    model: Optional[str] = None
    images: Optional[List[str]] = None


class AIResponse(BaseModel):
    html: str
    model: str
    say: str = ""


class ProjectIn(BaseModel):
    id: Optional[str] = None
    name: str = Field("Без названия", max_length=200)
    html: str = Field("", max_length=800000)
    kind: str = Field("project", max_length=40)


class ProjectMeta(BaseModel):
    id: str
    name: str
    kind: str
    created: str
    updated: str
    owner: str = ""


class Project(ProjectMeta):
    html: str


class AuditItem(BaseModel):
    sev: Literal["high", "med", "low", "ok"]
    title: str
    desc: str
    fix: str = ""


class AuditResponse(BaseModel):
    score: int
    items: List[AuditItem]
    high: int
    med: int
    low: int
    summary: str


class AuthIn(BaseModel):
    """Login accepts legacy passwords; registration uses RegisterIn."""
    username: str = Field(..., min_length=3, max_length=40)
    password: str = Field(..., min_length=1, max_length=200)


class RegisterIn(BaseModel):
    username: str = Field(..., min_length=3, max_length=40)
    password: str = Field(..., min_length=10, max_length=200)


class AuthOut(BaseModel):
    token: str
    username: str
    plan: str = "free"


class Me(BaseModel):
    id: Optional[str] = None
    username: str
    plan: str = "free"
    subscription_status: Optional[str] = None
    subscription_expires_at: Optional[str] = None
    enabled: bool
