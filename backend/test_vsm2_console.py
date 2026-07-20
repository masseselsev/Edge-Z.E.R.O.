from fastapi.testclient import TestClient
from app.main import app

def test_vsm2_console_routes():
    client = TestClient(app)
    res = client.get("/api/vsm2-flasher/console/ports")
    assert res.status_code == 401
    
    res = client.post("/api/vsm2-flasher/console/disconnect")
    assert res.status_code == 401
    print("Test passed: vsm2 console routes authenticated!")

if __name__ == "__main__":
    test_vsm2_console_routes()
