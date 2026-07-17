from fastapi.testclient import TestClient
from app.main import app

def test_system_bandwidth_endpoint():
    client = TestClient(app)
    response = client.get("/api/system/bandwidth")
    assert response.status_code == 200
    data = response.json()
    assert "cpu_utilization" in data
    assert "ram_utilization" in data
    assert "rx_speed" in data
    assert "tx_speed" in data
    assert "rx_percent" in data
    assert "tx_percent" in data
    print("Test passed: /api/system/bandwidth returned valid metrics!")

if __name__ == "__main__":
    test_system_bandwidth_endpoint()
