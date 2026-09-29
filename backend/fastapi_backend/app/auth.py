"""Verifies access tokens issued by the Django backend (djangorestframework-simplejwt).

Both services share JWT_SECRET_KEY and the HS256 algorithm. FastAPI never
issues tokens; users log in through Django.
"""

import os

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .database import get_db  # also loads .env
from .models import AuthUser
from .schemas import CurrentUser

JWT_SECRET_KEY = os.environ['JWT_SECRET_KEY']
JWT_ALGORITHM = 'HS256'

# auto_error=False so a missing header gives our own 401 instead of 403.
bearer_scheme = HTTPBearer(auto_error=False, description='Access token from the Django backend')


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={'WWW-Authenticate': 'Bearer'},
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> CurrentUser:
    if credentials is None:
        raise _unauthorized('Authentication credentials were not provided.')
    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
            options={'require': ['exp', 'token_type', 'user_id']},
        )
    except jwt.ExpiredSignatureError:
        raise _unauthorized('Token has expired.')
    except jwt.PyJWTError:
        raise _unauthorized('Token is invalid.')

    # Refresh tokens must not be usable as access tokens.
    if payload['token_type'] != 'access':
        raise _unauthorized('Token is invalid.')
    try:
        user_id = int(payload['user_id'])
    except (TypeError, ValueError):
        raise _unauthorized('Token is invalid.')

    # A valid signature is not enough: the account may have been deactivated
    # or deleted since the token was issued (Django applies the same check).
    user = db.get(AuthUser, user_id)
    if user is None or not user.is_active:
        raise _unauthorized('Token is invalid.')
    return CurrentUser(user_id=user_id)
