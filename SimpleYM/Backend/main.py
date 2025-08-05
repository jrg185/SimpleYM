from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Request
from pydantic import BaseModel, EmailStr
from typing import List, Dict
import pandas as pd
from firebase_service import upload_data, fetch_data, db
from config import COMPANY_NAME, TIME_ZONE, LOCATIONS
from firebase_admin import auth
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Request
from firebase_admin import auth
from firebase_admin.auth import EmailAlreadyExistsError
import pytz

# Initialize the FastAPI app
app = FastAPI(
    title="Yard Management Software",
    description="API backend for managing trailers, users, and yard operations.",
    version="1.0.0"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://your-app.firebaseapp.com",  # Replace with your Firebase domain
        "https://your-app.web.app"  # Replace with your Firebase domain
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Helper function to validate Firebase token
def validate_firebase_token(request: Request):
    auth_header = request.headers.get("Authorization")
    print("Authorization Header:", auth_header)

    if not auth_header:
        raise HTTPException(status_code=401, detail="Authorization header is missing")

    try:
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        print(f"Valid token for user: {decoded_token.get('email')}")
        return decoded_token
    except Exception as e:
        print(f"Invalid token: {e}")
        raise HTTPException(status_code=401, detail="Invalid authentication token")


# Helper function to generate timestamps
def get_current_timestamps():
    utc_now = datetime.utcnow().isoformat()
    est_now = datetime.now(TIME_ZONE).isoformat()
    return {
        "timestamp": utc_now,
        "timestamp_EST": est_now,
    }


# Pydantic models
class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str



class Record(BaseModel):
    collection: str
    data: List[Dict]


# Root endpoint
@app.get("/")
def root():
    return {"message": f"Welcome to {COMPANY_NAME} Yard Management Software"}


# Collection schema endpoint - ADDED
@app.get("/collection-schema")
def get_schema():
    """
    Provides schema for all database collections.
    Updated to include email field for moves and temperature_checks.

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
            "email": "String",  # ADDED EMAIL FIELD
            "status": "String"
        },
        "temperature_checks": {
            "id": "String",
            "trailer_id": "String",
            "clr_temp": "Number",
            "fzr_temp": "Number",
            "timestamp": "Timestamp",
            "user_id": "String",
            "email": "String"  # ADDED EMAIL FIELD
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


# Current time endpoint
@app.get("/current-time")
def get_current_time():
    try:
        current_time = datetime.now(TIME_ZONE).strftime("%Y-%m-%d %I:%M:%S %p EST")
        return {"current_time": current_time}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting current time: {str(e)}")


# Locations endpoint
@app.get("/locations")
def get_locations(request: Request = None):
    """Fetch locations from database, fallback to config if empty"""
    try:
        # Try to get locations from database first
        locations_ref = db.collection("locations")
        docs = locations_ref.stream()
        locations = [doc.to_dict().get("name", "") for doc in docs if doc.to_dict().get("name")]

        if locations:
            print(f"Fetched {len(locations)} locations from database")
            return {"locations": sorted(locations)}
        else:
            # Fallback to hardcoded locations if database is empty
            from config import LOCATIONS
            print("Using fallback hardcoded locations")
            return {"locations": LOCATIONS}

    except Exception as e:
        print(f"Error fetching locations: {e}")
        # Fallback to hardcoded locations on error
        from config import LOCATIONS
        return {"locations": LOCATIONS}


# Fetch data endpoint
@app.get("/fetch-data")
def fetch_data_endpoint(collection: str, request: Request):
    validate_firebase_token(request)
    try:
        print(f"Fetching data for collection: {collection}")
        data = fetch_data(collection)
        print(f"Fetched {len(data)} records from {collection}")
        return {"data": data}
    except Exception as e:
        print(f"Error fetching data: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# Add record endpoint
@app.post("/add-record")
async def add_record(record: Record, request: Request):
    """
    Updated to handle optional IDs and auto-generate them when not provided.
    """
    validate_firebase_token(request)

    try:
        if not record or not record.data or not record.collection:
            raise HTTPException(status_code=400, detail="Invalid data or collection name.")

        # Add timestamps and auto-generate IDs if not provided
        for item in record.data:
            # Auto-generate ID if not provided
            if not item.get("id"):
                item["id"] = f"{record.collection}_{int(datetime.utcnow().timestamp())}"

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

# Create user endpoint
@app.post("/create-auth-user")
def create_auth_user(user: CreateUserRequest, request: Request):
    """
    Creates a Firebase Authentication user and adds them to Firestore.
    Updated to remove permissions field.

    Args:
    - user (CreateUserRequest): The user's details.
    - request (Request): The HTTP request (for token validation)

    Returns:
    - Success message or error.
    """
    # Validate the requesting user's Firebase token
    validate_firebase_token(request)

    try:
        print(f"Creating user: {user.email} with role: {user.role}")

        # Create Firebase Authentication user
        auth_user = auth.create_user(
            email=user.email,
            password=user.password,
            display_name=user.name,
        )

        print(f"Firebase Auth user created with UID: {auth_user.uid}")

        # Add user to Firestore - removed permissions field
        user_data = {
            "id": auth_user.uid,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            # Removed permissions field
        }

        db.collection("user_master").document(auth_user.uid).set(user_data)
        print(f"User data added to Firestore: {user_data}")

        return {
            "message": f"User {user.email} created successfully with role {user.role}.",
            "uid": auth_user.uid,
            "created_in_auth": True,
            "created_in_firestore": True
        }

    except auth.EmailAlreadyExistsError:
        print(f"Email {user.email} already exists in Firebase Auth")
        raise HTTPException(status_code=400, detail=f"User with email {user.email} already exists")

    except auth.WeakPasswordError as e:
        print(f"Weak password error: {e}")
        raise HTTPException(status_code=400, detail="Password is too weak. Please use a stronger password.")

    except Exception as e:
        print(f"Error creating user: {str(e)}")
        print(f"Error type: {type(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating user: {str(e)}")


@app.get("/last-known-locations")
async def get_last_known_locations(request: Request):
    """
    Gets the last known location for each trailer based on completed moves.
    Returns trailer IDs in numerical order with their last location and timestamp.

    Returns:
    - List of trailers with their last known locations sorted numerically
    """
    validate_firebase_token(request)  # Require authentication

    try:
        print("Fetching last known locations...")

        # Get all completed moves ordered by completion time (most recent first)
        completed_moves = db.collection("moves").where("status", "==", "completed").order_by("completed_at",
                                                                                             direction=firestore.Query.DESCENDING).stream()

        # Dictionary to store the most recent location for each trailer
        trailer_locations = {}

        # Process each completed move
        for move_doc in completed_moves:
            move_data = move_doc.to_dict()
            trailer_id = move_data.get("trailer_id")

            # Skip if no trailer_id or if we already have a more recent location for this trailer
            if not trailer_id or trailer_id in trailer_locations:
                continue

            # Store the most recent location data for this trailer
            trailer_locations[trailer_id] = {
                "trailer_id": trailer_id,
                "last_location": move_data.get("to_location", "Unknown"),
                "timestamp": move_data.get("completed_at") or move_data.get("timestamp"),
                "from_location": move_data.get("from_wh_yard", "Unknown"),
                "from_door": move_data.get("from_door", "Unknown"),
                "to_door": move_data.get("to_door", "Unknown")
            }

        # Convert to list and sort numerically by trailer_id
        result = list(trailer_locations.values())

        # Sort numerically by trailer_id (handle both string and numeric trailer IDs)
        def sort_key(item):
            trailer_id = item["trailer_id"]
            try:
                # Try to convert to integer for numerical sorting
                return int(trailer_id)
            except (ValueError, TypeError):
                # If conversion fails, sort alphabetically
                return float('inf'), str(trailer_id)

        result.sort(key=sort_key)

        print(f"Found last known locations for {len(result)} trailers")

        return {
            "last_known_locations": result,
            "count": len(result),
            "generated_at": get_current_timestamps()["timestamp_EST"]
        }

    except Exception as e:
        print(f"Error fetching last known locations: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch last known locations: {str(e)}")


# Also add this helper endpoint to get trailer statistics
@app.get("/trailer-statistics")
async def get_trailer_statistics(request: Request):
    """
    Gets general statistics about trailers and their movements.

    Returns:
    - Total number of trailers with recorded moves
    - Number of trailers currently in motion (open/picked up moves)
    - Number of trailers at rest (last move completed)
    """
    validate_firebase_token(request)

    try:
        # Get all trailers with moves
        all_moves = db.collection("moves").stream()
        trailer_status = {}

        for move_doc in all_moves:
            move_data = move_doc.to_dict()
            trailer_id = move_data.get("trailer_id")
            status = move_data.get("status", "unknown")
            timestamp = move_data.get("completed_at") or move_data.get("timestamp")

            if not trailer_id:
                continue

            # Keep track of the most recent status for each trailer
            if trailer_id not in trailer_status or timestamp > trailer_status[trailer_id]["timestamp"]:
                trailer_status[trailer_id] = {
                    "status": status,
                    "timestamp": timestamp
                }

        # Count statistics
        total_trailers = len(trailer_status)
        in_motion = sum(1 for t in trailer_status.values() if t["status"] in ["open", "picked up"])
        at_rest = sum(1 for t in trailer_status.values() if t["status"] == "completed")

        return {
            "total_trailers_with_moves": total_trailers,
            "trailers_in_motion": in_motion,
            "trailers_at_rest": at_rest,
            "generated_at": get_current_timestamps()["timestamp_EST"]
        }

    except Exception as e:
        print(f"Error fetching trailer statistics: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch trailer statistics: {str(e)}")


@app.delete("/delete")
def delete_record(collection: str, id: str, request: Request):
    """
    Deletes a record from the specified Firebase collection by ID.
    Now includes proper authentication validation.

    Args:
    - collection (str): The Firebase collection name.
    - id (str): The document ID to delete.
    - request (Request): The HTTP request (for token validation)

    Returns:
    - Success message or error.
    """
    # Validate the requesting user's Firebase token
    validate_firebase_token(request)

    try:
        print(f"Attempting to delete record ID: {id} from collection: {collection}")

        document_ref = db.collection(collection).document(id)
        doc = document_ref.get()

        if not doc.exists:
            print(f"Record with ID {id} not found in {collection}")
            raise HTTPException(status_code=404, detail="Record not found.")

        # Special handling for user_master - also delete from Firebase Auth
        if collection == "user_master":
            try:
                # Delete from Firebase Authentication as well
                auth.delete_user(id)  # The id should be the Firebase Auth UID
                print(f"User {id} deleted from Firebase Auth")
            except auth.UserNotFoundError:
                print(f"User {id} not found in Firebase Auth (might already be deleted)")
            except Exception as auth_error:
                print(f"Error deleting user from Firebase Auth: {auth_error}")
                # Continue with Firestore deletion even if Auth deletion fails

        # Delete from Firestore
        document_ref.delete()
        print(f"Record with ID {id} successfully deleted from {collection}")

        return {"message": f"Record with ID {id} successfully deleted from {collection}."}

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        print(f"Error deleting record: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting record: {str(e)}")


# Also add an edit/update endpoint if you don't have one
@app.put("/update")
def update_record(collection: str, id: str, update_data: dict, request: Request):
    """
    Updates a record in the specified Firebase collection by ID.

    Args:
    - collection (str): The Firebase collection name.
    - id (str): The document ID to update.
    - update_data (dict): The data to update.
    - request (Request): The HTTP request (for token validation)

    Returns:
    - Success message or error.
    """
    # Validate the requesting user's Firebase token
    validate_firebase_token(request)

    try:
        print(f"Attempting to update record ID: {id} in collection: {collection}")
        print(f"Update data: {update_data}")

        document_ref = db.collection(collection).document(id)
        doc = document_ref.get()

        if not doc.exists:
            print(f"Record with ID {id} not found in {collection}")
            raise HTTPException(status_code=404, detail="Record not found.")

        # Add timestamp for the update
        timestamps = get_current_timestamps()
        update_data.update({
            "updated_at": timestamps["timestamp"],
            "updated_at_EST": timestamps["timestamp_EST"]
        })

        # Update the document
        document_ref.update(update_data)
        print(f"Record with ID {id} successfully updated in {collection}")

        return {"message": f"Record with ID {id} successfully updated in {collection}."}

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        print(f"Error updating record: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating record: {str(e)}")



# Upload Excel endpoint
@app.post("/upload-excel")
async def upload_excel(
        request: Request,
        file: UploadFile = File(None),
        collection: str = Form(None)
):
    validate_firebase_token(request)
    try:
        if not file:
            raise HTTPException(status_code=400, detail="No file provided")

        if not collection:
            raise HTTPException(status_code=400, detail="Collection name is required")

        print(f"File received: {file.filename}, Collection: {collection}")

        # Read and process Excel file
        contents = await file.read()
        df = pd.read_excel(contents)
        print(f"DataFrame loaded with {len(df)} rows")

        # Convert to dict and add timestamps
        data = df.to_dict(orient="records")
        for item in data:
            timestamps = get_current_timestamps()
            item.update(timestamps)

        upload_data(collection, data)
        return {"message": f"Successfully uploaded {len(data)} records to {collection}."}

    except Exception as e:
        print(f"Error in /upload-excel endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Error uploading file: {str(e)}")


# Temperature check endpoint - UPDATED WITH EMAIL LOGGING
@app.post("/add-temp-check")
async def add_temp_check(temp_check: dict, request: Request):
    validate_firebase_token(request)
    try:
        print("Received temp_check data:", temp_check)

        # Log email if provided - ADDED EMAIL LOGGING
        if temp_check.get("email"):
            print(f"Temperature check submitted by user: {temp_check.get('email')}")

        # Add timestamp
        temp_check["timestamp"] = datetime.now(TIME_ZONE).isoformat()

        # Generate unique ID if not provided
        if "id" not in temp_check:
            temp_check["id"] = f"TC{int(datetime.utcnow().timestamp())}"

        # Save to Firestore (automatically includes email field if provided)
        db.collection("temperature_checks").document(temp_check["id"]).set(temp_check)
        print("Data written to Firestore:", temp_check)

        return {"message": f"Temperature check added with ID {temp_check['id']}."}

    except Exception as e:
        print("Error in /add-temp-check endpoint:", str(e))
        raise HTTPException(status_code=500, detail=f"Failed to add temperature check: {str(e)}")


# Dashboard data endpoint
@app.get("/dashboard-data")
async def get_dashboard_data(request: Request):
    validate_firebase_token(request)
    try:
        def fetch_collection_data(collection_name, filters=None, order_by=None, limit=None):
            collection_ref = db.collection(collection_name)
            query = collection_ref

            if filters:
                for field, operator, value in filters:
                    query = query.where(field, operator, value)

            if order_by:
                query = query.order_by(order_by, direction=db.Query.DESCENDING)

            if limit:
                query = query.limit(limit)

            docs = query.stream()
            return [doc.to_dict() for doc in docs]

        # Fetch data
        open_moves = fetch_collection_data("moves", filters=[("status", "==", "open")])
        completed_moves = fetch_collection_data(
            "moves", filters=[("status", "==", "completed")], order_by="timestamp", limit=10
        )
        active_yard_users = fetch_collection_data("user_master", filters=[("role", "==", "yard")])
        temp_checks = fetch_collection_data("temperature_checks", order_by="timestamp", limit=10)

        return {
            "open_moves": open_moves,
            "completed_moves": completed_moves,
            "active_users": [user.get("id", "") for user in active_yard_users],
            "temp_checks": temp_checks,
        }
    except Exception as e:
        print(f"Error fetching dashboard data: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch dashboard data.")


# Trailer validation endpoint
@app.get("/validate-trailer")
def validate_trailer(trailer_id: str, request: Request):
    validate_firebase_token(request)
    try:
        trailers = db.collection("trailer_master").where("id", "==", trailer_id).get()
        return {"exists": len(list(trailers)) > 0}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Startup event
@app.on_event("startup")
async def startup_event():
    routes = [route.path for route in app.routes]
    print("Registered routes:", routes)
    print("LOCATIONS:", LOCATIONS)
    print("Backend server started successfully!")

# update record
# Add this endpoint to your Backend/main.py file

@app.put("/update-record")
async def update_record(record: Record, request: Request):
    validate_firebase_token(request)
    try:
        if not record or not record.data or not record.collection:
            raise HTTPException(status_code=400, detail="Invalid data or collection name.")

        if len(record.data) != 1:
            raise HTTPException(status_code=400, detail="Can only update one record at a time.")

        item = record.data[0]

        if not item.get("id"):
            raise HTTPException(status_code=400, detail="Record ID is required for updates.")

        # Add update timestamp
        timestamps = get_current_timestamps()
        item["updated_at"] = timestamps["timestamp"]
        item["updated_at_EST"] = timestamps["timestamp_EST"]

        print(f"Updating record in collection: {record.collection}")
        print(f"Data: {item}")

        # Update the document
        doc_ref = db.collection(record.collection).document(item["id"])
        doc_ref.update(item)

        return {"message": f"Record updated successfully in {record.collection}."}

    except Exception as e:
        print(f"Error in /update-record endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating record: {str(e)}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)