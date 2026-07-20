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

def test_repo_list():
    client = TestClient(app)
    
    # Query files list (publicly, no auth required)
    response = client.get("/api/vsm2-flasher/api/repo/list?path=controlboard")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    
    # We expect files like setup.sh, autoflash.sh, app.py
    file_names = [f["name"] for f in data]
    assert "setup.sh" in file_names
    assert "app.py" in file_names
    
    # Check that download_url is absolute and points to the correct endpoint
    setup_file = next(f for f in data if f["name"] == "setup.sh")
    assert setup_file["type"] == "file"
    assert setup_file["download_url"].endswith("/api/vsm2-flasher/files/controlboard/setup.sh")
    assert setup_file["download_url"].startswith("http://")
    
    # Test directory structure listing
    dist_dir = next(f for f in data if f["name"] == "dist")
    assert dist_dir["type"] == "dir"
    assert dist_dir["download_url"] is None
    
    # Test listing nested folder
    response_dist = client.get("/api/vsm2-flasher/api/repo/list?path=controlboard/dist")
    assert response_dist.status_code == 200
    data_dist = response_dist.json()
    dist_file_names = [f["name"] for f in data_dist]
    assert "commands.py" in dist_file_names
    assert "controlboard.py" in dist_file_names
    
    # Test directory traversal vulnerability protection
    response_traversal = client.get("/api/vsm2-flasher/api/repo/list?path=../../")
    assert response_traversal.status_code == 403
    print("Test passed: repo list endpoint verified!")

if __name__ == "__main__":
    test_repo_endpoints()
    test_repo_list()

