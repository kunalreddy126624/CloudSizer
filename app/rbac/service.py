from __future__ import annotations

from functools import lru_cache

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, sessionmaker

from app.rbac.config import RbacSettings, get_rbac_settings
from app.rbac.database import Base, create_session_factory
from app.rbac.models import AuditLog, EstimationRequest, Permission, Role, User
from app.rbac.schemas import (
    AuditLogQuery,
    AuditLogRead,
    EstimationCreate,
    EstimationRead,
    PermissionName,
    RoleName,
    TokenResponse,
    UserRead,
)
from app.rbac.security import create_access_token, hash_password, verify_password


PERMISSION_DESCRIPTIONS: dict[PermissionName, str] = {
    PermissionName.CREATE_ESTIMATION: "Create estimation requests.",
    PermissionName.VIEW_ESTIMATION: "View estimation requests.",
    PermissionName.APPROVE_REQUEST: "Approve allocation requests.",
    PermissionName.REJECT_REQUEST: "Reject allocation requests.",
    PermissionName.ALLOCATE_RESOURCES: "Trigger provisioning and allocation.",
    PermissionName.VIEW_COST: "View cost data and budget details.",
    PermissionName.MANAGE_USERS: "Create users and assign roles.",
    PermissionName.VIEW_LOGS: "View audit logs.",
}

ROLE_PERMISSIONS: dict[RoleName, tuple[PermissionName, ...]] = {
    RoleName.ADMIN: tuple(PermissionName),
    RoleName.ARCHITECT: (PermissionName.CREATE_ESTIMATION, PermissionName.VIEW_ESTIMATION),
    RoleName.APPROVER: (
        PermissionName.VIEW_ESTIMATION,
        PermissionName.APPROVE_REQUEST,
        PermissionName.REJECT_REQUEST,
    ),
    RoleName.FINOPS: (PermissionName.VIEW_ESTIMATION, PermissionName.VIEW_COST, PermissionName.VIEW_LOGS),
    RoleName.OPERATOR: (PermissionName.VIEW_ESTIMATION, PermissionName.ALLOCATE_RESOURCES, PermissionName.VIEW_LOGS),
    RoleName.VIEWER: (PermissionName.VIEW_ESTIMATION,),
}

ROLE_DESCRIPTIONS: dict[RoleName, str] = {
    RoleName.ADMIN: "Full administrative access.",
    RoleName.ARCHITECT: "Creates estimations and reviews platform designs.",
    RoleName.APPROVER: "Approves or rejects allocation requests.",
    RoleName.FINOPS: "Reviews cost data and budget enforcement decisions.",
    RoleName.OPERATOR: "Triggers provisioning once approvals are complete.",
    RoleName.VIEWER: "Read-only estimation access.",
}


class RbacService:
    def __init__(self, settings: RbacSettings, session_factory: sessionmaker[Session]) -> None:
        self.settings = settings
        self.session_factory = session_factory

    def init_database(self) -> None:
        engine = self.session_factory.kw["bind"]
        Base.metadata.create_all(bind=engine)
        with self.session_factory() as session:
            self._seed_permissions(session)
            self._seed_roles(session)
            self._ensure_default_admin(session)
            session.commit()

    def authenticate(self, email: str, password: str) -> TokenResponse | None:
        with self.session_factory() as session:
            user = self._get_user_by_email(session, email)
            if user is None or not user.is_active or not verify_password(password, user.password_hash):
                return None
            roles = self._role_names(user)
            permissions = self._permission_names(user)
            token, expires_in = create_access_token(
                settings=self.settings,
                user_id=user.id,
                email=user.email,
                roles=roles,
                permissions=permissions,
            )
            return TokenResponse(
                access_token=token,
                expires_in=expires_in,
                user=self._to_user_read(user),
            )

    def record_login_attempt(
        self,
        *,
        email: str,
        success: bool,
        request_path: str,
        method: str,
        user_id: int | None = None,
        metadata: dict | None = None,
    ) -> None:
        self.write_audit_log(
            user_id=user_id,
            action="login_attempt",
            resource_type="auth_session",
            resource_id=email.lower(),
            method=method,
            path=request_path,
            status_code=200 if success else 401,
            metadata={
                "email": email.lower(),
                "success": success,
                **(metadata or {}),
            },
        )

    def create_user(self, email: str, full_name: str, password: str, roles: list[RoleName]) -> UserRead:
        with self.session_factory() as session:
            existing = self._get_user_by_email(session, email)
            if existing is not None:
                raise ValueError("A user with this email already exists.")
            user = User(email=email.lower(), full_name=full_name, password_hash=hash_password(password), is_active=True)
            user.roles = self._roles_by_name(session, roles)
            session.add(user)
            session.commit()
            session.refresh(user)
            return self._to_user_read(user)

    def list_users(self) -> list[UserRead]:
        with self.session_factory() as session:
            users = session.scalars(
                select(User).options(joinedload(User.roles).joinedload(Role.permissions)).order_by(User.id)
            ).unique().all()
            return [self._to_user_read(user) for user in users]

    def assign_roles(self, user_id: int, roles: list[RoleName]) -> UserRead:
        with self.session_factory() as session:
            user = session.get(User, user_id)
            if user is None:
                raise KeyError("User not found.")
            user.roles = self._roles_by_name(session, roles)
            session.commit()
            session.refresh(user)
            return self._to_user_read(user)

    def get_user(self, user_id: int) -> User | None:
        with self.session_factory() as session:
            return session.scalar(
                select(User)
                .options(joinedload(User.roles).joinedload(Role.permissions))
                .where(User.id == user_id)
            )

    def create_estimation(self, user_id: int, request: EstimationCreate) -> EstimationRead:
        with self.session_factory() as session:
            record = EstimationRequest(
                title=request.title,
                provider=request.provider,
                status="draft",
                estimated_monthly_cost_usd=request.estimated_monthly_cost_usd,
                payload_json=request.payload,
                created_by=user_id,
            )
            session.add(record)
            session.commit()
            session.refresh(record)
            return self._to_estimation_read(record)

    def list_estimations(self) -> list[EstimationRead]:
        with self.session_factory() as session:
            records = session.scalars(select(EstimationRequest).order_by(EstimationRequest.id.desc())).all()
            return [self._to_estimation_read(record) for record in records]

    def update_estimation_status(self, estimation_id: int, *, status: str, approver_id: int | None = None) -> EstimationRead:
        with self.session_factory() as session:
            record = session.get(EstimationRequest, estimation_id)
            if record is None:
                raise KeyError("Estimation not found.")
            record.status = status
            if approver_id is not None:
                record.approved_by = approver_id
            session.commit()
            session.refresh(record)
            return self._to_estimation_read(record)

    def list_audit_logs(self, query: AuditLogQuery | None = None) -> list[AuditLogRead]:
        query = query or AuditLogQuery()
        with self.session_factory() as session:
            statement = select(AuditLog).order_by(AuditLog.id.desc()).limit(query.limit)
            if query.user_id is not None:
                statement = statement.where(AuditLog.user_id == query.user_id)
            if query.action:
                statement = statement.where(AuditLog.action == query.action)
            if query.resource_id:
                statement = statement.where(AuditLog.resource_id == query.resource_id)
            items = session.scalars(statement).all()
            return [
                AuditLogRead(
                    id=item.id,
                    user_id=item.user_id,
                    action=item.action,
                    resource_type=item.resource_type,
                    resource_id=item.resource_id,
                    timestamp=item.created_at.isoformat(),
                    metadata=item.metadata_json,
                    method=item.method,
                    path=item.path,
                    status_code=item.status_code,
                    detail_json=item.metadata_json,
                    created_at=item.created_at.isoformat(),
                )
                for item in items
            ]

    def write_audit_log(
        self,
        *,
        user_id: int | None,
        action: str,
        resource_type: str,
        resource_id: str | None,
        method: str,
        path: str,
        status_code: int,
        metadata: dict,
    ) -> None:
        with self.session_factory() as session:
            session.add(
                AuditLog(
                    user_id=user_id,
                    action=action,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    method=method,
                    path=path,
                    status_code=status_code,
                    metadata_json=metadata,
                )
            )
            session.commit()

    def _seed_permissions(self, session: Session) -> None:
        existing = {item.name for item in session.scalars(select(Permission)).all()}
        for permission_name, description in PERMISSION_DESCRIPTIONS.items():
            if permission_name.value in existing:
                continue
            session.add(Permission(name=permission_name.value, description=description))

    def _seed_roles(self, session: Session) -> None:
        session.flush()
        permissions = {
            permission.name: permission for permission in session.scalars(select(Permission)).all()
        }
        existing_roles = {role.name: role for role in session.scalars(select(Role)).all()}
        for role_name, permission_names in ROLE_PERMISSIONS.items():
            role = existing_roles.get(role_name.value)
            if role is None:
                role = Role(name=role_name.value, description=ROLE_DESCRIPTIONS[role_name])
                session.add(role)
                session.flush()
            role.description = ROLE_DESCRIPTIONS[role_name]
            role.permissions = [permissions[name.value] for name in permission_names]

    def _ensure_default_admin(self, session: Session) -> None:
        admin = self._get_user_by_email(session, "admin@cloudsizer.local")
        if admin is None:
            admin = User(
                email="admin@cloudsizer.local",
                full_name="CloudSizer Admin",
                password_hash=hash_password("CloudSizer123!"),
                is_active=True,
            )
            session.add(admin)
            session.flush()
        admin.roles = self._roles_by_name(session, [RoleName.ADMIN])

    def _get_user_by_email(self, session: Session, email: str) -> User | None:
        return session.scalar(
            select(User)
            .options(joinedload(User.roles).joinedload(Role.permissions))
            .where(User.email == email.lower())
        )

    def _roles_by_name(self, session: Session, roles: list[RoleName]) -> list[Role]:
        wanted = [role.value for role in roles]
        items = session.scalars(select(Role).where(Role.name.in_(wanted))).all()
        if len(items) != len(wanted):
            raise ValueError("One or more roles are invalid.")
        return items

    def _role_names(self, user: User) -> list[RoleName]:
        return [RoleName(role.name) for role in user.roles]

    def _permission_names(self, user: User) -> list[PermissionName]:
        names = sorted({permission.name for role in user.roles for permission in role.permissions})
        return [PermissionName(name) for name in names]

    def _to_user_read(self, user: User) -> UserRead:
        return UserRead(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            is_active=user.is_active,
            roles=[
                {
                    "name": role.name,
                    "description": role.description,
                    "permissions": [
                        {"name": permission.name, "description": permission.description}
                        for permission in sorted(role.permissions, key=lambda item: item.name)
                    ],
                }
                for role in sorted(user.roles, key=lambda item: item.name)
            ],
        )

    def _to_estimation_read(self, record: EstimationRequest) -> EstimationRead:
        return EstimationRead(
            id=record.id,
            title=record.title,
            provider=record.provider,
            status=record.status,
            estimated_monthly_cost_usd=record.estimated_monthly_cost_usd,
            payload=record.payload_json,
            created_by=record.created_by,
            approved_by=record.approved_by,
        )


@lru_cache(maxsize=1)
def get_rbac_service() -> RbacService:
    settings = get_rbac_settings()
    return RbacService(settings=settings, session_factory=create_session_factory(settings))
