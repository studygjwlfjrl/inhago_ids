import logging
import os
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from database import get_supabase, get_user_supabase
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pathlib import Path
from postgrest.exceptions import APIError
load_dotenv(Path(__file__).resolve().parent / '.env')

app = FastAPI(title="InhaGo API")
app.add_middleware(CORSMiddleware,
    allow_origins=[origin.strip().rstrip("/") for origin in os.getenv("FRONTEND_ORIGINS", "").split(",") if origin.strip()],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"])
security = HTTPBearer()
class MeetingCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    description: str = ""
    category: str = Field(min_length=1)
    location_name: str = Field(min_length=1)
    latitude: float | None = None
    longitude: float | None = None
    meeting_time: datetime
    max_participants: int = Field(ge=2)


class MeetingUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None
    category: str | None = Field(default=None, min_length=1)
    location_name: str | None = Field(default=None, min_length=1)
    latitude: float | None = None
    longitude: float | None = None
    meeting_time: datetime | None = None
    max_participants: int | None = Field(default=None, ge=2)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    try:
        supabase = get_supabase()
        response = supabase.auth.get_user(credentials.credentials)

        if response.user is None:
            raise HTTPException(
                status_code=401,
                detail="유효하지 않은 로그인 토큰입니다."
            )

        return response.user

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=401,
            detail="로그인 인증에 실패했습니다."
        )


@app.get("/")
def home():
    return {
        "message": "InhaGo Backend API",
        "status": "ok"
    }


@app.get("/meetings")
def get_meetings(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    user=Depends(get_current_user)
):
    try:
        supabase = get_user_supabase(credentials.credentials)
        response = (
            supabase.table("meetings")
            .select(
                "id,title,description,category,"
                "location_name,latitude,longitude,"
                "meeting_time,max_participants,status,creator_id"
            )
            .eq("status", "open")
            .gte("meeting_time", datetime.now(timezone.utc).isoformat())
            .order("meeting_time")
            .execute()
        )

        meetings = response.data or []
        if meetings:
            ids = [m["id"] for m in meetings]
            rows = (supabase.table("meeting_participants")
                .select("meeting_id,user_id")
                .in_("meeting_id", ids)
                .eq("status", "joined")
                .execute()).data or []
            members = {}
            for row in rows:
                members.setdefault(row["meeting_id"], set()).add(row["user_id"])
            for m in meetings:
                m["participant_count"] = len(members.get(m["id"], set()) | {m["creator_id"]})
        return {"meetings": meetings}

    except Exception:
        
        logging.exception("모임 목록 조회 중 오류 발생")
        raise HTTPException(
            status_code=500,
            detail="모임 목록을 불러오지 못했습니다."
    )


@app.post("/meetings", status_code=201)
def create_meeting(
    meeting: MeetingCreate,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    user=Depends(get_current_user)
):
    try:
        supabase = get_user_supabase(credentials.credentials)

        data = meeting.model_dump(mode="json")
        data["category"] = {"food": "meal"}.get(data["category"], data["category"])
        data["creator_id"] = str(user.id)
        data["status"] = "open"

        response = (
            supabase.table("meetings")
            .insert(data)
            .execute()
        )

        return {"meeting": response.data[0]}

    except APIError as exc:
        logging.exception("모임 생성 DB 오류")
        if exc.code == "23514":
            raise HTTPException(status_code=422, detail="모임 카테고리가 DB 제약조건과 일치하지 않습니다.")
        raise HTTPException(status_code=500, detail="모임 저장 중 DB 오류가 발생했습니다.")
    except Exception:
        logging.exception("모임 생성 중 오류 발생")
        raise HTTPException(
            status_code=500,
            detail="모임을 생성하지 못했습니다."
        )



   
@app.post("/meetings/{meeting_id}/join")
def join_meeting(
    meeting_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    user=Depends(get_current_user)
):
    try:
        supabase = get_user_supabase(credentials.credentials)

        response = (
            supabase.rpc(
                "join_meeting_safe",
                {"p_meeting_id": meeting_id}
            )
            .execute()
        )

        if not response.data:
            raise HTTPException(
                status_code=500,
                detail="모임 참여 결과를 확인할 수 없습니다."
            )

        return {
            "message": "모임 참여가 완료되었습니다.",
            "participant": response.data
        }

    except HTTPException:
        raise
    except Exception as e:
        if "이미 참여 중인 모임입니다" in str(e):
            raise HTTPException(
                status_code=409,
                detail="이미 참여 중인 모임입니다."
            )

        logging.exception("모임 참여 중 오류 발생")
        raise HTTPException(
            status_code=500,
            detail="모임 참여에 실패했습니다."
        )


    
@app.patch("/meetings/{meeting_id}")
def update_meeting(
    meeting_id: str,
    updates: MeetingUpdate,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    user=Depends(get_current_user)
):
    try:
        supabase = get_user_supabase(credentials.credentials)

        # 수정할 항목만 추출
        data = updates.model_dump(exclude_unset=True, mode="json")

        if not data:
            raise HTTPException(
                status_code=400,
                detail="수정할 내용을 입력해주세요."
            )

        

        # 모임장이면서 아직 열려 있는 모임만 수정 가능
        response = (
            supabase.table("meetings")
            .update(data)
            .eq("id", meeting_id)
            .eq("creator_id", str(user.id))
            .eq("status", "open")
            .select("*")
            .execute()
        )

        if not response.data:
            raise HTTPException(
                status_code=404,
                detail="수정 가능한 모임이 없거나 권한이 없습니다."
            )

        return {
            "message": "모임 수정이 완료되었습니다.",
            "meeting": response.data[0]
        }

    except HTTPException:
        raise
    except Exception:
        logging.exception("모임 수정 중 오류 발생")
        raise HTTPException(
            status_code=500,
            detail="모임 수정에 실패했습니다."
        )

@app.delete("/meetings/{meeting_id}/leave")
def leave_meeting(
    meeting_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    user=Depends(get_current_user)
):
    try:
        supabase = get_user_supabase(credentials.credentials)

        response = (
            supabase.table("meeting_participants")
            .delete()
            .eq("meeting_id", meeting_id)
            .eq("user_id", str(user.id))
            .select("id")
            .execute()
        )

        if not response.data:
            raise HTTPException(
                status_code=404,
                detail="참여 중인 모임을 찾을 수 없습니다."
            )

        return {"message": "모임 탈퇴가 완료되었습니다."}

    except HTTPException:
        raise
    except Exception:
        logging.exception("모임 탈퇴 중 오류 발생")
        raise HTTPException(
            status_code=500,
            detail="모임 탈퇴에 실패했습니다."
        )


@app.patch("/meetings/{meeting_id}/cancel")
def cancel_meeting(
    meeting_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    user=Depends(get_current_user)
):
    try:
        supabase = get_user_supabase(credentials.credentials)

        response = (
            supabase.table("meetings")
            .update({"status": "cancelled"})
            .eq("id", meeting_id)
            .eq("creator_id", str(user.id))
            .eq("status", "open")
            .select("id,title,status")
            .execute()
        )

        if not response.data:
            raise HTTPException(
                status_code=404,
                detail="취소할 수 있는 모임이 없거나 모임장이 아닙니다."
            )

        return {
            "message": "모임 취소가 완료되었습니다.",
            "meeting": response.data[0]
        }

    except HTTPException:
        raise
    except Exception:
        logging.exception("모임 취소 중 오류 발생")
        raise HTTPException(
            status_code=500,
            detail="모임 취소에 실패했습니다."
        )


@app.patch("/meetings/{meeting_id}/complete")
def complete_meeting(
    meeting_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    user=Depends(get_current_user)
):
    """모임장만 지난 모임을 완료 처리할 수 있습니다."""
    try:
        supabase = get_user_supabase(credentials.credentials)
        result = (supabase.table("meetings")
                  .select("id,meeting_time")
                  .eq("id", meeting_id)
                  .eq("creator_id", str(user.id))
                  .eq("status", "open")
                  .maybe_single().execute())
        meeting = result.data
        if not meeting:
            raise HTTPException(status_code=404, detail="완료할 모임이 없거나 모임장이 아닙니다.")
        scheduled = datetime.fromisoformat(meeting["meeting_time"].replace("Z", "+00:00"))
        if scheduled > datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="모임 예정 시간이 지난 후 완료할 수 있습니다.")
        response = (supabase.table("meetings")
                    .update({"status": "completed"})
                    .eq("id", meeting_id)
                    .eq("creator_id", str(user.id))
                    .eq("status", "open")
                    .select("id,title,status").execute())
        if not response.data:
            raise HTTPException(status_code=409, detail="이미 처리된 모임입니다.")
        return {"message": "모임이 완료되었습니다.", "meeting": response.data[0]}
    except HTTPException:
        raise
    except Exception:
        logging.exception("모임 완료 처리 실패")
        raise HTTPException(status_code=500, detail="모임 완료 처리에 실패했습니다.")


@app.get("/meetings/mine")
def get_my_meetings(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    user=Depends(get_current_user)
):
    """내가 만든 모임과 참여 중인 모임(지난 모임 포함)."""
    try:
        supabase = get_user_supabase(credentials.credentials)
        created = (supabase.table("meetings")
                   .select("*").eq("creator_id", str(user.id)).execute()).data or []
        participations = (supabase.table("meeting_participants")
                          .select("meeting_id").eq("user_id", str(user.id))
                          .eq("status", "joined").execute()).data or []
        ids = list({r["meeting_id"] for r in participations})
        joined = (supabase.table("meetings").select("*").in_("id", ids).execute()).data if ids else []
        meetings = {str(m["id"]): m for m in (created + (joined or []))}
        return {"meetings": sorted(meetings.values(), key=lambda m: m.get("meeting_time") or "", reverse=True)}
    except Exception:
        logging.exception("내 모임 목록 조회 실패")
        raise HTTPException(status_code=500, detail="내 모임을 불러오지 못했습니다.")
