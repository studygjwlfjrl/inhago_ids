
from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from database import get_supabase

app = FastAPI(title="InhaGo API")
security = HTTPBearer()
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
def get_meetings(user=Depends(get_current_user)):
    try:
        supabase = get_supabase()

        response = (
            supabase.table("meetings")
            .select(
                "id,title,description,category,"
                "location_name,latitude,longitude,"
                "meeting_time,max_participants,status"
            )
            .eq("status", "open")
            .gte("meeting_time", "now()")
            .order("meeting_time")
            .execute()
        )

        return {
            "meetings": response.data
        }

    except Exception:
        import logging
        logging.exception("모임 목록 조회 중 오류 발생")
        raise HTTPException(
            status_code=500,
            detail="모임 목록을 불러오지 못했습니다."
    )
