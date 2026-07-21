import asyncio
from unittest.mock import AsyncMock, MagicMock
from app.api.endpoints.vsm2_flasher import get_shortcuts, save_shortcuts, ShortcutsSaveRequest
from app.models.system_settings import SystemSettings
import json

async def run_tests():
    # Test 1: Get default shortcuts
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_db.execute.return_value = mock_result
    mock_result.scalar_one_or_none.return_value = None
    mock_user = AsyncMock()
    mock_user.username = "testuser"
    
    res = await get_shortcuts(db=mock_db, current_user=mock_user)
    assert res == ["read temp", "read version", "read tech_data", "write led 1", "write led 0"]
    print("Test 1 passed: Default shortcuts returned successfully!")

    # Test 2: Save and retrieve shortcuts
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_db.execute.return_value = mock_result
    mock_user = AsyncMock()
    mock_user.username = "testuser"
    
    # Mock database record fetch
    settings_record = SystemSettings(key="user_shortcuts:testuser", value=json.dumps(["custom cmd 1"]))
    mock_result.scalar_one_or_none.return_value = settings_record
    
    req = ShortcutsSaveRequest(shortcuts=["custom cmd 1"])
    post_res = await save_shortcuts(payload=req, db=mock_db, current_user=mock_user)
    assert post_res == {"status": "success"}
    
    get_res = await get_shortcuts(db=mock_db, current_user=mock_user)
    assert get_res == ["custom cmd 1"]
    print("Test 2 passed: Save and get custom shortcuts worked successfully!")

if __name__ == "__main__":
    asyncio.run(run_tests())
