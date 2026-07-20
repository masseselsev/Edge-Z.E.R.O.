from fastapi.testclient import TestClient
from app.main import app

def test_repo_endpoints():
    client = TestClient(app)
    response = client.get("/api/vsm2-flasher/repo-status")
    # Expect 401 since user is not logged in
    assert response.status_code == 401
    
    # We check files without login
    response = client.get("/api/vsm2-flasher/files/controlboard/setup.sh")
    # Can be 404 if clone hasn't completed, but shouldn't crash
    assert response.status_code in (200, 404)
    print("Test passed: repo endpoints verified!")

if __name__ == "__main__":
    test_repo_endpoints()
