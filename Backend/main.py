from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Request
from pydantic import BaseModel, EmailStr
from typing import List, Dict
import pandas as pd
from firebase_service import upload_data, fetch_data, db
from config import COMPANY_NAME, TIME_ZONE
from firebase_admin import auth
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime

# Initialize the FastAPI app
app = FastAPI(
    title="Yard Management Software",
    description="API backend for managing trailers, users, and yard operations.",
    version="1.0.0"
)

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Replace with your frontend's origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Helper function to generate timestamps
def get_current_timestamps():
    """
    Returns the current timestamps in UTC and EST.
    """
    utc_now = datetime.utcnow().isoformat()  # UTC timestamp
    est_now = datetime.now(TIME_ZONE).isoformat()  # EST timestamp
    return {
        "timestamp": utc_now,  # ISO 8601 format in UTC
        "timestamp_EST": est_now,  # ISO 8601 format in EST
    }

# Pydantic models for request validation
class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str
    permissions: str = "read"

class Record(BaseModel):
    collection: str
    data: List[Dict]

# Root endpoint
@app.get("/")
def root():
    """
    Root endpoint to confirm API is active.
    """
    return {"message": f"Welcome to {COMPANY_NAME} Yard Management Software"}

# Endpoint to fetch data from a specified Firebase collection
@app.get("/fetch-data")
def fetch_data_endpoint(collection: str, request: Request):
    validate_firebase_token(request)  # Validate Firebase token
    try:
        print(f"Fetching data for collection: {collection}")
        data = fetch_data(collection)
        return {"data": data}
    except Exception as e:
        print(f"Error fetching data: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Endpoint to upload JSON records or Excel files to Firebase
from fastapi import Body

@app.post("/upload-excel")
async def upload_json_or_excel(
    record: Record = Body(None), file: UploadFile = None, collection: str = Form(None)
):
    try:
        if file:  # Handle Excel file upload
            print(f"File received: {file.filename}, Collection: {collection}")
            if not collection:
                raise HTTPException(status_code=400, detail="Collection name is required for Excel uploads.")

            contents = await file.read()
            df = pd.read_excel(contents)
            print(f"DataFrame Loaded: {df.head()}")
            data = df.to_dict(orient="records")
            upload_data(collection, data)
            return {"message": f"Successfully uploaded Excel file to {collection}."}

        if record:  # Handle JSON data upload
            print(f"Received JSON payload: {record}")
            if not record or not record.data or not record.collection:
                raise HTTPException(status_code=400, detail="Invalid data or collection name.")

            print(f"Collection: {record.collection}")
            print(f"Data: {record.data}")

            # Add timestamps to each record
            for item in record.data:
                timestamps = get_current_timestamps()
                item.update(timestamps)

            # Log updated data with timestamps
            print(f"Data with timestamps: {record.data}")

            upload_data(record.collection, record.data)
            return {"message": f"Successfully uploaded data to {record.collection}."}

        raise HTTPException(status_code=400, detail="No valid data provided.")

    except Exception as e:
        print(f"Error in /upload-excel endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Error uploading data: {str(e)}")


# Endpoint to create a user in Firebase Authentication and Firestore
@app.post("/create-auth-user")
def create_auth_user(user: CreateUserRequest):
    """
    Creates a Firebase Authentication user and adds them to Firestore.

    Args:
    - user (CreateUserRequest): The user's details.

    Returns:
    - Success message or error.
    """
    try:
        # Create Firebase Authentication user
        auth_user = auth.create_user(
            email=user.email,
            password=user.password,
            display_name=user.name,
        )

        # Add user to Firestore
        db.collection("user_master").document(auth_user.uid).set({
            "id": auth_user.uid,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "permissions": user.permissions,
        })

        return {"message": f"User {user.email} created successfully with role {user.role}."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating user: {str(e)}")

# Endpoint to get database schema
@app.get("/collection-schema")
def get_schema():
    """
    Provides schema for all database collections.

    Returns:
    - JSON schema for each collection.
    """
    return {
        "trailer_master": {
            "id": "String",
            "year": "Number",
            "length": "Number",
            "manufacturer": "String",
            "roll_up_door": "Boolean",
            "reefer": "Boolean",
            "zones": "Number"
        },
        "user_master": {
            "id": "String",
            "name": "String",
            "email": "String",
            "role": "String",
            "permissions": "Array"
        },
        "moves": {
            "id": "String",
            "trailer_id": "String",
            "from_wh_yard": "String",
            "from_door": "String",
            "to_wh_yard": "String",
            "to_door": "String",
            "timestamp": "Timestamp",
            "timestamp_EST": "Timestamp",
            "created_at": "Timestamp",
            "picked_up_at": "Timestamp",
            "completed_at": "Timestamp",
            "user_id": "String",
            "status": "String"
        },
        "temperature_checks": {
            "id": "String",
            "trailer_id": "String",
            "clr_temp": "Number",
            "fzr_temp": "Number",
            "timestamp": "Timestamp",
            "user_id": "String"
        },
        "inbound_pos": {
            "id": "String",
            "po_numbers": "String",
            "trailer_id": "String",
            "status": "String",
            "timestamp": "Timestamp"
        },
        "load_submission": {
            "id": "String",
            "user_id": "String",
            "trailer_id": "String",
            "from_wh": "String",
            "from_door": "String"
        }
    }

# Endpoint to update move timestamps
@app.put("/update-move-timestamps/{move_id}")
def update_move_timestamps(move_id: str, event: str):
    """
    Updates the timestamp for a specific event (created, picked up, or completed).

    Args:
    - move_id (str): The ID of the move to update.
    - event (str): The event type (created, picked up, or completed).

    Returns:
    - Success message or error.
    """
    try:
        move_ref = db.collection("moves").document(move_id)
        move = move_ref.get()
        if not move.exists:
            raise HTTPException(status_code=404, detail="Move not found.")

        # Add the current timestamp for the specified event
        timestamps = get_current_timestamps()
        if event == "created":
            move_ref.update({"created_at": timestamps["timestamp"], "created_at_EST": timestamps["timestamp_EST"]})
        elif event == "picked_up":
            move_ref.update({"picked_up_at": timestamps["timestamp"], "picked_up_at_EST": timestamps["timestamp_EST"]})
        elif event == "completed":
            move_ref.update({"completed_at": timestamps["timestamp"], "completed_at_EST": timestamps["timestamp_EST"]})
        else:
            raise HTTPException(status_code=400, detail="Invalid event type.")

        return {"message": f"Successfully updated {event} timestamp for move {move_id}."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating timestamps: {str(e)}")


@app.get("/current-time")
def get_current_time():
    from datetime import datetime
    from config import TIME_ZONE

    now = datetime.now(TIME_ZONE).strftime("%Y-%m-%d %H:%M:%S")
    return {"current_time": now}





# Endpoint to delete a record by ID
@app.delete("/delete")
def delete_record(collection: str, id: str):
    """
    Deletes a record from the specified Firebase collection by ID.

    Args:
    - collection (str): The Firebase collection name.
    - id (str): The document ID to delete.

    Returns:
    - Success message or error.
    """
    try:
        document_ref = db.collection(collection).document(id)
        if not document_ref.get().exists:
            raise HTTPException(status_code=404, detail="Record not found.")

        document_ref.delete()
        return {"message": f"Record with ID {id} successfully deleted from {collection}."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/locations")
def get_locations():
    """
    Fetches the available locations from the config file.
    """
    from config import LOCATIONS
    return {"locations": LOCATIONS}



@app.get("/validate-trailer")
def validate_trailer(trailer_id: str):
    """
    Checks if the given Trailer ID exists in the 'trailer_master' collection.

    Args:
    - trailer_id (str): The ID of the trailer to validate.

    Returns:
    - JSON response indicating whether the trailer exists.
    """
    try:
        trailers = db.collection("trailer_master").where("id", "==", trailer_id).get()
        if trailers:
            return {"exists": True}
        else:
            return {"exists": False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from fastapi import Request, HTTPException
from firebase_admin import auth

def validate_firebase_token(request: Request):
    auth_header = request.headers.get("Authorization")
    print("Authorization Header:", auth_header)  # Log the header

    if not auth_header:
        raise HTTPException(status_code=401, detail="Authorization header is missing")

    try:
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        return decoded_token
    except Exception as e:
        print(f"Invalid token: {e}")
        raise HTTPException(status_code=401, detail="Invalid authentication token")



@app.post("/add-record")
async def add_record(record: Record):
    """
    Endpoint to add individual records to the specified collection.

    Args:
    - record (Record): Contains the collection name and the data to upload.

    Returns:
    - Success message or error.
    """
    try:
        if not record or not record.data or not record.collection:
            raise HTTPException(status_code=400, detail="Invalid data or collection name.")

        # Add timestamps to the record
        for item in record.data:
            timestamps = get_current_timestamps()
            item.update(timestamps)

        # Log the data being uploaded
        print(f"Uploading to collection: {record.collection}")
        print(f"Data: {record.data}")

        # Upload the data to Firestore
        upload_data(record.collection, record.data)
        return {"message": f"Record added successfully to {record.collection}."}

    except Exception as e:
        print(f"Error in /add-record endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Error adding record: {str(e)}")


from datetime import datetime
import pytz
from config import TIME_ZONE

@app.post("/add-temp-check")
async def add_temp_check(temp_check: dict, request: Request):
    validate_firebase_token(request)  # Validate the Firebase token

    try:
        # Log received data
        print("Received temp_check data:", temp_check)

        # Get the current UTC time
        utc_now = datetime.utcnow()
        print("Current UTC time:", utc_now)

        # Convert UTC to EST using pytz
        est = pytz.timezone("America/New_York")  # Hardcoded for EST
        est_now = utc_now.astimezone(est)
        print("Converted EST time:", est_now)

        # Add the EST timestamp to the payload
        temp_check["timestamp"] = est_now.isoformat()

        # Generate a unique ID for the record
        temp_check["id"] = f"TC{int(datetime.utcnow().timestamp())}"
        print("Generated ID:", temp_check["id"])

        # Save the data in Firestore
        collection_name = "temperature_checks"
        db.collection(collection_name).document(temp_check["id"]).set(temp_check)
        print("Data written to Firestore:", temp_check)

        return {"message": f"Temperature check added with ID {temp_check['id']}."}
    except Exception as e:
        print("Error in /add-temp-check endpoint:", str(e))  # Log the error
        raise HTTPException(status_code=500, detail=f"Failed to add temperature check: {str(e)}")

from fastapi import FastAPI, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel
from typing import List
import pytz
from datetime import datetime

db = firestore.client()

# Helper function to get documents
def fetch_collection_data(collection_name, filters=None, order_by=None, limit=None):
    collection_ref = db.collection(collection_name)
    query = collection_ref

    if filters:
        for field, operator, value in filters:
            query = query.where(field, operator, value)

    if order_by:
        query = query.order_by(order_by, direction=firestore.Query.DESCENDING)

    if limit:
        query = query.limit(limit)

    docs = query.stream()
    return [doc.to_dict() for doc in docs]


@app.get("/dashboard-data")
async def get_dashboard_data():
    try:
        # Fetch Open Moves
        open_moves = fetch_collection_data("moves", filters=[("status", "==", "open")])

        # Fetch Recently Completed Moves
        completed_moves = fetch_collection_data(
            "moves", filters=[("status", "==", "completed")], order_by="timestamp", limit=10
        )

        # Fetch Active Yard Users
        active_yard_users = fetch_collection_data("user_master", filters=[("role", "==", "yard")])

        # Fetch Temp Check List
        temp_checks = fetch_collection_data("temperature_checks", order_by="timestamp", limit=10)

        # Return Data
        return {
            "open_moves": open_moves,
            "completed_moves": completed_moves,
            "active_users": [user.get("id", "") for user in active_yard_users],
            "temp_checks": temp_checks,
        }
    except Exception as e:
        print(f"Error fetching dashboard data: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch dashboard data.")


@app.on_event("startup")
async def startup_event():
    routes = [route.path for route in app.routes]
    print("Registered routes:", routes)

try:
    from config import LOCATIONS
    print("LOCATIONS:", LOCATIONS)
except Exception as e:
    print("Error importing LOCATIONS:", e)
