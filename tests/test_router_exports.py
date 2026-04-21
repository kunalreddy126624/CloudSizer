import unittest

from fastapi import APIRouter, FastAPI

from app.allocator import allocator_router
from app.api import api_router
from app.noodle import noodle_router
from app.rbac import rbac_router


class RouterExportsTestCase(unittest.TestCase):
    def test_package_level_router_exports_are_available(self) -> None:
        routers = [api_router, allocator_router, noodle_router, rbac_router]

        for router in routers:
            self.assertIsInstance(router, APIRouter)

    def test_app_can_include_package_level_router_exports(self) -> None:
        app = FastAPI()

        app.include_router(api_router)
        app.include_router(allocator_router)
        app.include_router(noodle_router)
        app.include_router(rbac_router)

        self.assertGreater(len(app.routes), 4)
