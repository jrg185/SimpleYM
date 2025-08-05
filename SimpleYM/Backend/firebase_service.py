import firebase_admin
from firebase_admin import credentials, firestore

if not firebase_admin._apps:
    cred = credentials.Certificate("service_account.json")
    firebase_admin.initialize_app(cred)

db = firestore.client()

def upload_data(collection_name, data):
    collection_ref = db.collection(collection_name)
    for record in data:
        doc_id = str(record.get("id", ""))
        if doc_id:
            collection_ref.document(doc_id).set(record)
        else:
            collection_ref.add(record)

def fetch_data(collection_name):
    collection_ref = db.collection(collection_name)
    return [doc.to_dict() for doc in collection_ref.stream()]
