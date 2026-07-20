import os
import git
import threading
import logging

logger = logging.getLogger(__name__)
REPO_URL = "https://github.com/masseselsev/controlboard.git"
REPO_CACHE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "vsm2_repo_cache"))
REPO_LOCK = threading.Lock()

def sync_repo():
    with REPO_LOCK:
        try:
            env = os.environ.copy()
            env['GIT_TERMINAL_PROMPT'] = '0'
            if not os.path.exists(os.path.join(REPO_CACHE_DIR, '.git')):
                logger.info(f"Cloning {REPO_URL} to {REPO_CACHE_DIR}")
                os.makedirs(REPO_CACHE_DIR, exist_ok=True)
                git.Repo.clone_from(REPO_URL, REPO_CACHE_DIR, env=env)
            else:
                logger.info(f"Updating {REPO_CACHE_DIR}")
                repo = git.Repo(REPO_CACHE_DIR)
                with repo.git.custom_environment(GIT_TERMINAL_PROMPT='0'):
                    repo.remotes.origin.fetch()
                    repo.git.reset('--hard', 'origin/main')
                    repo.git.clean('-fdx')
            return True
        except Exception as e:
            logger.error(f"Repo sync failed: {e}")
            return False

def get_repo_info():
    if not os.path.exists(os.path.join(REPO_CACHE_DIR, '.git')):
        return {"exists": False}
    try:
        repo = git.Repo(REPO_CACHE_DIR)
        head = repo.head.commit
        fetch_head = os.path.join(REPO_CACHE_DIR, '.git', 'FETCH_HEAD')
        last_synced = "Never"
        if os.path.exists(fetch_head):
            import datetime
            mtime = os.path.getmtime(fetch_head)
            last_synced = datetime.datetime.fromtimestamp(mtime, tz=datetime.timezone.utc).isoformat()
        return {
            "exists": True,
            "commit": head.hexsha[:7],
            "author": str(head.author),
            "date": head.committed_datetime.isoformat(),
            "message": head.message.strip(),
            "branch": repo.active_branch.name,
            "last_synced": last_synced
        }
    except Exception as e:
        return {"exists": False, "error": str(e)}
