from pydantic import BaseModel, ConfigDict, Field


class UserCreate(BaseModel):
    # Letters, numbers and underscore only, 3-30 characters
    username: str = Field(min_length=3, max_length=30, pattern=r"^[A-Za-z0-9_]+$")
    password: str = Field(min_length=6, max_length=72)


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    # from_attributes=True lets Pydantic read fields straight from a SQLAlchemy User
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    is_admin: bool


class TokenOut(BaseModel):
    token: str
    user: UserOut