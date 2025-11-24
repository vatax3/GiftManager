import os
import secrets

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy import create_engine, Column, Integer, String, Boolean, Float, ForeignKey, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
from passlib.context import CryptContext

# --- CONFIGURATION ---
SECRET_KEY = "secret_key_a_changer_absolument"

# --- DATABASE SETUP (SQLite) ---
DB_FILE = os.getenv("SQLITE_PATH", "./data/giftmanager.db")
db_dir = os.path.dirname(DB_FILE)
if db_dir:
    os.makedirs(db_dir, exist_ok=True)

SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_FILE}"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- MODELS ---
class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_admin = Column(Boolean, default=False)
    projects_link = relationship("ProjectMember", back_populates="user_link")

class Project(Base):
    __tablename__ = "projects"
    code = Column(String, primary_key=True, index=True)
    name = Column(String)
    members = relationship("ProjectMember", back_populates="project", cascade="all, delete-orphan")
    expenses = relationship("Expense", back_populates="project", cascade="all, delete-orphan")

class ProjectMember(Base):
    __tablename__ = "project_members"
    id = Column(Integer, primary_key=True, index=True)
    project_code = Column(String, ForeignKey("projects.code"))
    name = Column(String)
    linked_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    
    project = relationship("Project", back_populates="members")
    user_link = relationship("User", back_populates="projects_link")

class Expense(Base):
    __tablename__ = "expenses"
    id = Column(String, primary_key=True, index=True)
    project_code = Column(String, ForeignKey("projects.code"))
    type = Column(String) # 'expense' or 'settlement'
    title = Column(String, nullable=True)
    amount = Column(Float)
    payer = Column(String)
    beneficiary = Column(String, nullable=True)
    receiver = Column(String, nullable=True)
    involved = Column(JSON)
    is_bought = Column(Boolean, default=False)
    date = Column(String)

    project = relationship("Project", back_populates="expenses")

Base.metadata.create_all(bind=engine)

# --- SCHEMAS ---
class UserLogin(BaseModel):
    username: str
    password: str

class PasswordReset(BaseModel):
    new_password: str

class ProjectCreate(BaseModel):
    name: str
    code: str

class ExpenseCreate(BaseModel):
    id: str
    type: str
    title: Optional[str] = None
    amount: float
    payer: str
    beneficiary: Optional[str] = None
    receiver: Optional[str] = None
    involved: List[str] = []
    is_bought: bool = False
    date: str

class MemberLink(BaseModel):
    member_name: str
    create_new: bool

# --- UTILS ---
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- ENDPOINTS ---

@app.post("/auth/register")
def register(user: UserLogin, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == user.username).first():
        raise HTTPException(status_code=400, detail="Utilisateur déjà existant")
    
    is_admin = db.query(User).count() == 0 or user.username == "admin"
    
    new_user = User(
        id=secrets.token_hex(8),
        username=user.username,
        hashed_password=pwd_context.hash(user.password),
        is_admin=is_admin
    )
    db.add(new_user)
    db.commit()
    return {"id": new_user.id, "username": new_user.username, "is_admin": new_user.is_admin}

@app.post("/auth/login")
def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if not db_user or not pwd_context.verify(user.password, db_user.hashed_password):
        raise HTTPException(status_code=401, detail="Identifiants incorrects")
    
    project_codes = [p.project_code for p in db_user.projects_link]
    return {
        "id": db_user.id, 
        "username": db_user.username, 
        "is_admin": db_user.is_admin,
        "myProjectCodes": list(set(project_codes))
    }

@app.post("/projects")
def create_project(project: ProjectCreate, db: Session = Depends(get_db)):
    if db.query(Project).filter(Project.code == project.code).first():
        raise HTTPException(status_code=400, detail="Code projet déjà pris")
    new_proj = Project(code=project.code, name=project.name)
    db.add(new_proj)
    db.commit()
    return project

@app.get("/projects/{code}")
def get_project(code: str, db: Session = Depends(get_db)):
    proj = db.query(Project).filter(Project.code == code).first()
    if not proj:
        raise HTTPException(404, "Projet introuvable")
    
    return {
        "code": proj.code,
        "name": proj.name,
        "members": [{"name": m.name, "linkedUserId": m.linked_user_id} for m in proj.members],
        "expenses": proj.expenses
    }

@app.post("/projects/{code}/join")
def join_project(code: str, link_data: MemberLink, user_id: str, db: Session = Depends(get_db)):
    proj = db.query(Project).filter(Project.code == code).first()
    if not proj: raise HTTPException(404, "Projet introuvable")

    if link_data.create_new:
        if db.query(ProjectMember).filter_by(project_code=code, name=link_data.member_name).first():
             raise HTTPException(400, "Ce nom est déjà pris dans le projet")
        new_member = ProjectMember(project_code=code, name=link_data.member_name, linked_user_id=user_id)
        db.add(new_member)
    else:
        member = db.query(ProjectMember).filter_by(project_code=code, name=link_data.member_name).first()
        if member:
            if member.linked_user_id and member.linked_user_id != user_id:
                raise HTTPException(400, "Ce profil est déjà lié à quelqu'un d'autre")
            member.linked_user_id = user_id
    
    db.commit()
    return {"status": "ok"}

@app.post("/projects/{code}/expenses")
def sync_expenses(code: str, expense: ExpenseCreate, db: Session = Depends(get_db)):
    existing = db.query(Expense).filter(Expense.id == expense.id).first()
    if existing:
        for key, value in expense.dict().items():
            setattr(existing, key, value)
    else:
        new_expense = Expense(project_code=code, **expense.dict())
        db.add(new_expense)
    
    all_names = [expense.payer] + expense.involved
    if expense.beneficiary: all_names.append(expense.beneficiary)
    if expense.receiver: all_names.append(expense.receiver)
    
    for name in set(all_names):
        if name and not db.query(ProjectMember).filter_by(project_code=code, name=name).first():
            db.add(ProjectMember(project_code=code, name=name))
            
    db.commit()
    return {"status": "ok"}

@app.get("/admin/stats")
def admin_stats(db: Session = Depends(get_db)):
    projs = db.query(Project).all()
    users = db.query(User).all()
    
    proj_data = [{"code": p.code, "name": p.name, "memberCount": len(p.members), "expenseCount": len(p.expenses)} for p in projs]
    user_data = [{"id": u.id, "username": u.username, "isAdmin": u.is_admin, "myProjectCodes": list(set([pm.project_code for pm in u.projects_link]))} for u in users]

    return {"projects": proj_data, "users": user_data}

@app.delete("/admin/projects/{code}")
def delete_project(code: str, db: Session = Depends(get_db)):
    proj = db.query(Project).filter(Project.code == code).first()
    if not proj: raise HTTPException(404, "Projet introuvable")
    db.delete(proj)
    db.commit()
    return {"status": "deleted"}

@app.put("/admin/users/{user_id}/password")
def reset_password(user_id: str, payload: PasswordReset, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user: raise HTTPException(404, "Utilisateur introuvable")
    user.hashed_password = pwd_context.hash(payload.new_password)
    db.commit()
    return {"status": "updated"}

# --- STATIC SPA (built frontend) ---
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(STATIC_DIR):
    assets_dir = os.path.join(STATIC_DIR, "assets")
    if os.path.isdir(assets_dir):
        # Serve built assets efficiently
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        """
        Serve SPA index.html for client routes; serve direct files when present.
        API routes remain matched first because they are declared above.
        """
        if STATIC_DIR and os.path.isdir(STATIC_DIR):
            candidate = os.path.join(STATIC_DIR, full_path)
            if os.path.isfile(candidate):
                return FileResponse(candidate)
            index_file = os.path.join(STATIC_DIR, "index.html")
            if os.path.exists(index_file):
                return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Static assets not built")
