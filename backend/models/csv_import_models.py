from pydantic import BaseModel
from typing import Optional, Dict


class CSVImportMappedRequest(BaseModel):
    mapping: Dict[str, Optional[str]]
    create_missing_athletes: bool = True


class MappingTemplateCreate(BaseModel):
    name: str
    provider: Optional[str] = None
    mapping: Dict[str, Optional[str]]
