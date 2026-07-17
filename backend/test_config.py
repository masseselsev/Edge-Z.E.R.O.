import os
from app.core.config import Settings

def test_settings_load_from_env():
    os.environ["SECRET_KEY"] = "test-secret-env-value"
    test_settings = Settings()
    assert test_settings.SECRET_KEY == "test-secret-env-value"
    print("Test passed: settings successfully loaded from environment!")

if __name__ == "__main__":
    test_settings_load_from_env()
