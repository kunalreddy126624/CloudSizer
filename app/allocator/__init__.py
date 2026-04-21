"""Allocator subsystem for multi-cloud account vending and provisioning orchestration."""

from app.allocator.api import router as allocator_router

__all__ = ["allocator_router"]
