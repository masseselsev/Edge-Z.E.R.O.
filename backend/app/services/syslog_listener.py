"""
Async UDP Syslog listener (RFC 3164 / BSD syslog).

Binds to 0.0.0.0:5140 on startup.
Receives syslog datagrams from the Debian installer (d-i preseed/syslog-server).
Maps the source IP to a Box by ip_address and writes a ProvisioningLog row.
Called from main.py startup via asyncio.create_task(start_syslog_listener()).
"""

import asyncio
import logging

logger = logging.getLogger(__name__)

# RFC 3164 syslog messages start with <PRI> — strip it if present
def _strip_syslog_header(raw: str) -> str:
    cleaned = raw.strip()
    if cleaned.startswith("<"):
        try:
            after_pri = cleaned[cleaned.index(">") + 1:].strip()
            if ":" in after_pri:
                parts = after_pri.split(":", 1)
                return parts[1].strip()
            return after_pri
        except Exception:
            return cleaned
    return cleaned


class _SyslogProtocol(asyncio.DatagramProtocol):
    """asyncio datagram protocol that handles incoming syslog UDP packets."""

    def __init__(self):
        self._tasks: set[asyncio.Task] = set()

    def datagram_received(self, data: bytes, addr: tuple[str, int]) -> None:
        task = asyncio.ensure_future(self._persist(data, addr[0]))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    def error_received(self, exc: Exception) -> None:
        logger.warning("Syslog UDP error: %s", exc)

    async def _persist(self, data: bytes, source_ip: str) -> None:
        raw = data.decode("utf-8", errors="replace")
        message = _strip_syslog_header(raw)
        if not message:
            return

        # Import lazily to avoid circular imports at module load time
        from sqlalchemy import select, cast
        from sqlalchemy.dialects.postgresql import INET
        from app.db.session import AsyncSessionLocal
        from app.models.box import Box, BoxStatus
        from app.models.provisioning_log import ProvisioningLog

        try:
            async with AsyncSessionLocal() as db:
                res = await db.execute(
                    select(Box).where(Box.ip_address == cast(source_ip, INET))
                )
                box = res.scalars().first()
                if not box:
                    # Fallback: match box currently in INSTALLING status
                    res_inst = await db.execute(
                        select(Box).where(Box.status == BoxStatus.INSTALLING)
                    )
                    box = res_inst.scalars().first()
                    if box and not box.ip_address:
                        box.ip_address = source_ip

                if box:
                    db.add(ProvisioningLog(
                        box_id=box.id,
                        message=f"[d-i] {message}"
                    ))
                    await db.commit()
        except Exception as exc:
            logger.error("Syslog persist error (src=%s): %s", source_ip, exc)


async def start_syslog_listener(host: str = "0.0.0.0", port: int = 5140) -> None:
    """
    Start the UDP syslog listener.  Call once from startup_event().
    The coroutine returns immediately after binding; the protocol object
    is kept alive by the event loop transport.
    """
    loop = asyncio.get_event_loop()
    try:
        transport, _ = await loop.create_datagram_endpoint(
            _SyslogProtocol,
            local_addr=(host, port),
        )
        logger.info("Syslog UDP listener bound on %s:%d", host, port)
    except OSError as exc:
        logger.error("Failed to bind syslog listener on %s:%d — %s", host, port, exc)
