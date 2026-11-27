"""Modelos de entrada para las operaciones administrativas."""
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class CustomerCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    username: str = Field(min_length=3, max_length=80, pattern=r"^[A-Za-z0-9_.-]+$")
    email: EmailStr
    nombre: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=12, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if not any(c.islower() for c in value) or not any(c.isupper() for c in value) or not any(c.isdigit() for c in value):
            raise ValueError("La contraseña debe incluir mayúsculas, minúsculas y números")
        return value


class AssignmentCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id_usuario: int = Field(gt=0)
    id_vehiculo: int = Field(gt=0)


class ExhibitionToggleIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    es_exhibicion: bool



class CustomerDemoAssignmentsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id_demos: list[int] = Field(default_factory=list, max_length=200)

    @field_validator("id_demos")
    @classmethod
    def validate_demo_ids(cls, value: list[int]) -> list[int]:
        if any(not isinstance(item, int) or item <= 0 for item in value):
            raise ValueError("Todos los identificadores de DEMO deben ser enteros positivos")
        if len(value) != len(set(value)):
            raise ValueError("No repitas identificadores de DEMO")
        return value