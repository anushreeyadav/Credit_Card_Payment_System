"""Shared OpenAPI (drf-spectacular) building blocks for documenting error responses."""

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiExample, OpenApiResponse, inline_serializer
from rest_framework import serializers

ErrorDetail = inline_serializer(
    name='ErrorDetail',
    fields={
        'detail': serializers.CharField(),
        'code': serializers.CharField(required=False),
    },
)


def error(description, example_detail):
    return OpenApiResponse(
        response=ErrorDetail,
        description=description,
        examples=[OpenApiExample('Example', value={'detail': example_detail}, response_only=True)],
    )


def validation_error(example):
    return OpenApiResponse(
        response=OpenApiTypes.OBJECT,
        description='Validation failed: `{"field": ["message", ...]}`. Submitted values are not echoed back.',
        examples=[OpenApiExample('Example', value=example, response_only=True)],
    )


UNAUTHORIZED = error('Missing, invalid or expired access token.', 'Authentication credentials were not provided.')
FORBIDDEN_ADMIN = error(
    'Not a staff user, or missing the Django permission for this section.',
    'You do not have permission to view this section.',
)
THROTTLED = error('Too many attempts from this IP address.', 'Request was throttled. Expected available in 42 seconds.')
