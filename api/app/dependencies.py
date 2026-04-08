from fastapi import Depends, HTTPException, Request, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.supabase_client import get_user_from_token
from typing import Optional
import logging

security = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)

def get_current_user(
    request: Request, 
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    token_query: Optional[str] = Query(None, alias="token")
) -> str:
    # 1. Try to get token from Authorization header
    token = None
    if credentials:
        token = credentials.credentials
    # 2. Fallback to 'token' query parameter (useful for browser-initiated GETs like images/PDFs)
    elif token_query:
        token = token_query
        
    if not token:
        # Don't log for common browser calls to avoid spam, or log as warning
        # logger.warning(f"Request to {request.url.path} missing authentication token")
        raise HTTPException(status_code=403, detail="Not authenticated")
    
    try:
        user_id = get_user_from_token(token)
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        return user_id
    except Exception as e:
        logger.error(f"Authentication failed: {str(e)}")
        raise HTTPException(status_code=401, detail="Invalid or expired token")
