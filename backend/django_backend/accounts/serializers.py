from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.views.decorators.debug import sensitive_variables
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'is_staff', 'date_joined']
        read_only_fields = fields


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, trim_whitespace=False, style={'input_type': 'password'})
    password_confirm = serializers.CharField(write_only=True, trim_whitespace=False)
    email = serializers.EmailField(max_length=254)

    class Meta:
        model = User
        fields = ['username', 'email', 'first_name', 'last_name', 'password', 'password_confirm']
        extra_kwargs = {
            'first_name': {'required': False, 'max_length': 150},
            'last_name': {'required': False, 'max_length': 150},
        }

    def validate_username(self, value):
        # Django's own uniqueness check is case-sensitive; "Alice" and "alice" would both be allowed.
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('A user with that username already exists.')
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return value

    @sensitive_variables('attrs', 'password')
    def validate(self, attrs):
        password = attrs.get('password')
        if password != attrs.pop('password_confirm', None):
            raise serializers.ValidationError({'password_confirm': 'Passwords do not match.'})
        # Runs AUTH_PASSWORD_VALIDATORS (length, common, numeric, similarity to username/email).
        candidate = User(
            username=attrs.get('username', ''),
            email=attrs.get('email', ''),
            first_name=attrs.get('first_name', ''),
            last_name=attrs.get('last_name', ''),
        )
        try:
            validate_password(password, user=candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'password': list(exc.messages)})
        return attrs

    @sensitive_variables('validated_data', 'password')
    def create(self, validated_data):
        password = validated_data.pop('password')
        return User.objects.create_user(password=password, **validated_data)


class LoginCredentialsSerializer(serializers.Serializer):
    """Documentation only: the body of POST /api/auth/login/."""

    username = serializers.CharField(help_text='Username, or the email address of the account.')
    password = serializers.CharField(style={'input_type': 'password'})


class TokenResponseSerializer(serializers.Serializer):
    """Documentation only: login/refresh response. The refresh token is in the cookie, not here."""

    access = serializers.CharField(help_text='JWT access token (5 minutes). Send as `Authorization: Bearer <access>`.')
    user = UserSerializer()


class LoginSerializer(TokenObtainPairSerializer):
    """Username/password login. An email address is accepted in place of the username."""

    default_error_messages = {'no_active_account': 'Invalid username or password.'}

    @sensitive_variables('attrs')
    def validate(self, attrs):
        identifier = (attrs.get(self.username_field) or '').strip()
        if '@' in identifier:
            match = User.objects.filter(email__iexact=identifier).values_list('username', flat=True).first()
            if match:
                identifier = match
        attrs[self.username_field] = identifier
        return super().validate(attrs)
