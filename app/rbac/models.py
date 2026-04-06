from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Table, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.rbac.database import Base


user_roles = Table(
    "rbac_user_roles",
    Base.metadata,
    Column("user_id", ForeignKey("rbac_users.id"), primary_key=True),
    Column("role_id", ForeignKey("rbac_roles.id"), primary_key=True),
)

role_permissions = Table(
    "rbac_role_permissions",
    Base.metadata,
    Column("role_id", ForeignKey("rbac_roles.id"), primary_key=True),
    Column("permission_id", ForeignKey("rbac_permissions.id"), primary_key=True),
)


class User(Base):
    __tablename__ = "rbac_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(String(512))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    roles: Mapped[list[Role]] = relationship("Role", secondary=user_roles, back_populates="users")
    audit_logs: Mapped[list[AuditLog]] = relationship("AuditLog", back_populates="user")
    estimations: Mapped[list[EstimationRequest]] = relationship(
        "EstimationRequest",
        back_populates="created_by_user",
        foreign_keys="EstimationRequest.created_by",
    )


class Role(Base):
    __tablename__ = "rbac_roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    description: Mapped[str] = mapped_column(String(255))

    users: Mapped[list[User]] = relationship("User", secondary=user_roles, back_populates="roles")
    permissions: Mapped[list[Permission]] = relationship(
        "Permission", secondary=role_permissions, back_populates="roles"
    )


class Permission(Base):
    __tablename__ = "rbac_permissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    description: Mapped[str] = mapped_column(String(255))

    roles: Mapped[list[Role]] = relationship("Role", secondary=role_permissions, back_populates="permissions")


class AuditLog(Base):
    __tablename__ = "rbac_audit_logs"
    __table_args__ = (
        Index("ix_rbac_audit_logs_user_action_timestamp", "user_id", "action", "created_at"),
        Index("ix_rbac_audit_logs_resource", "resource_type", "resource_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("rbac_users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(120), index=True)
    resource_type: Mapped[str] = mapped_column(String(120))
    resource_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    method: Mapped[str] = mapped_column(String(16))
    path: Mapped[str] = mapped_column(String(255))
    status_code: Mapped[int] = mapped_column(Integer)
    metadata_json: Mapped[dict] = mapped_column("detail_json", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped[User | None] = relationship("User", back_populates="audit_logs")


class EstimationRequest(Base):
    __tablename__ = "rbac_estimations"
    __table_args__ = (UniqueConstraint("title", "created_by", name="uq_rbac_estimations_title_creator"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200), index=True)
    provider: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(64), default="draft", nullable=False)
    estimated_monthly_cost_usd: Mapped[float] = mapped_column(nullable=False, default=0.0)
    payload_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_by: Mapped[int] = mapped_column(ForeignKey("rbac_users.id"))
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("rbac_users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    created_by_user: Mapped[User] = relationship("User", foreign_keys=[created_by], back_populates="estimations")
