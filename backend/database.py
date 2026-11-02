
import os
from functools import lru_cache
from supabase import create_client


@lru_cache
def get_supabase():
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_PUBLISHABLE_KEY"]

    return create_client(url, key)
