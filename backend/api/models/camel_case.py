from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

# converts Python snake_case fields to camelCase when serialized to JSON and vice versa
class CamelCase(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    def dump(self) -> dict:
        return self.model_dump(by_alias=True)
