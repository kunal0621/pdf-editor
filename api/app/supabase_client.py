from supabase import create_client, Client
from cachetools import TTLCache
from app.config import settings

# Initialize Supabase client
supabase: Client = create_client(settings.supabase_url, settings.supabase_anon_key)

# In-memory cache for user info
# TTL of 300 seconds (5 minutes), max 1000 users
user_cache = TTLCache(maxsize=1000, ttl=300)

def get_user_from_token(token: str) -> str:
    """
    Validates the token with Supabase and returns the user_id.
    Uses an in-memory cache to avoid redundant network calls.
    """
    if token in user_cache:
        return user_cache[token]
    
    # Call Supabase Auth API to get user
    # This validates the JWT and returns user details
    response = supabase.auth.get_user(token)
    user_id = response.user.id
    
    # Store in cache
    user_cache[token] = user_id
    
    return user_id
