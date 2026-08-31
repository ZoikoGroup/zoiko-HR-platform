"""
modules/assistant/router.py
-------------------------------
Aggregates every assistant sub-router. Registered in app.main via the same
`_safe_import` pattern as every other module's top-level router.
"""

from fastapi import APIRouter

from app.modules.assistant.conversation_router import conversation_router
from app.modules.assistant.action_router import action_router
from app.modules.assistant.handoff_router import handoff_router, handoff_admin_router
from app.modules.assistant.knowledge_router import knowledge_router
from app.modules.assistant.operations_router import operations_router
from app.modules.assistant.scope_router import scope_router
from app.modules.assistant.privacy_router import privacy_router
from app.modules.assistant.attachment_router import attachment_router
from app.modules.assistant.public_router import public_router

assistant_router = APIRouter()
assistant_router.include_router(conversation_router)
assistant_router.include_router(action_router)
assistant_router.include_router(handoff_router)
assistant_router.include_router(handoff_admin_router)
assistant_router.include_router(knowledge_router)
assistant_router.include_router(operations_router)
assistant_router.include_router(scope_router)
assistant_router.include_router(privacy_router)
assistant_router.include_router(attachment_router)
assistant_router.include_router(public_router)
