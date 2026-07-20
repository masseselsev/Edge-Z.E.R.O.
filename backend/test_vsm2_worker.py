from fastapi.testclient import TestClient
from app.main import app

def test_flasher_routes():
    client = TestClient(app)
    res = client.get("/api/vsm2-flasher/stream")
    assert res.status_code == 401 # Auth required

    res = client.post("/api/vsm2-flasher/logs/clear")
    assert res.status_code == 401 # Auth required
    print("Test passed: flasher routes authenticated!")

if __name__ == "__main__":
    test_flasher_routes()
