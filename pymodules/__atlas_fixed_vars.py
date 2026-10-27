# pymodules/__atlas_fixed_vars.py

import hashlib
import os


PORT = int(os.getenv("ATLAS_PORT", "6424"))
RUN = "PROD"
VERSION = "2.10.434"
VERSION_HASH = hashlib.sha256(VERSION.encode("utf-8")).hexdigest()
MAX_PILLOW_WORKERS = 2
VISUAL_DEBUG = False

# P2P state (identity, peer lists, logs); overridable so two instances can run
# side by side on one machine without sharing identities.
P2P_DATA_DIR = os.getenv("ATLAS_P2P_DATA_DIR", "internal_data/p2p")


def get_external_p2p_port():
    return int(os.getenv("EXTERNAL_P2P_OPEN_PORT", PORT))
