#!/usr/bin/env python3
"""
Migration script to move hardcoded locations to Firestore database
"""

from firebase_service import db
from config import LOCATIONS
from firebase_admin import firestore
import uuid
from datetime import datetime


def migrate_locations():
    """Move hardcoded locations from config to Firestore"""
    print("Starting location migration...")

    try:
        # Check if locations already exist in database
        existing_locations = list(db.collection("locations").stream())

        if existing_locations:
            print(f"Found {len(existing_locations)} existing locations in database:")
            for loc in existing_locations:
                print(f"  - {loc.to_dict().get('name', 'Unknown')}")

            response = input("Do you want to proceed and add missing locations? (y/n): ")
            if response.lower() != 'y':
                print("Migration cancelled.")
                return

        # Get existing location names
        existing_names = [loc.to_dict().get('name', '') for loc in existing_locations]

        # Add each hardcoded location to database
        locations_ref = db.collection("locations")
        added_count = 0

        for location_name in LOCATIONS:
            if location_name not in existing_names:
                location_data = {
                    "id": str(uuid.uuid4()),
                    "name": location_name,
                    "description": f"Migrated location: {location_name}",
                    "active": True,
                    "created_at": datetime.utcnow().isoformat()
                }

                # Use location name as document ID for easier retrieval
                doc_id = location_name.replace(" ", "_").replace("/", "_").upper()
                locations_ref.document(doc_id).set(location_data)

                print(f"✅ Added location: {location_name}")
                added_count += 1
            else:
                print(f"⏭️  Skipped existing location: {location_name}")

        print(f"\n🎉 Migration completed! Added {added_count} new locations to database.")
        print("You can now manage locations through the Admin Tasks interface.")

        # Verify the migration
        print("\nVerifying migration...")
        all_locations = list(db.collection("locations").stream())
        print(f"Total locations in database: {len(all_locations)}")

        for loc in all_locations:
            data = loc.to_dict()
            status = "✅ Active" if data.get('active', True) else "❌ Inactive"
            print(f"  - {data.get('name', 'Unknown')} {status}")

    except Exception as e:
        print(f"❌ Migration failed: {e}")
        raise


def test_location_endpoint():
    """Test that the new locations endpoint works"""
    print("\n" + "=" * 50)
    print("Testing location endpoint...")

    try:
        # This simulates what the API endpoint does
        locations_ref = db.collection("locations")
        docs = locations_ref.stream()
        locations = [doc.to_dict().get("name", "") for doc in docs if doc.to_dict().get("name")]

        print(f"✅ API would return: {sorted(locations)}")

    except Exception as e:
        print(f"❌ Test failed: {e}")


if __name__ == "__main__":
    print("🚀 Location Migration Tool")
    print("=" * 50)

    try:
        migrate_locations()
        test_location_endpoint()

        print("\n" + "=" * 50)
        print("✅ Migration completed successfully!")
        print("Next steps:")
        print("1. Restart your backend server")
        print("2. Check Admin Tasks → locations collection")
        print("3. Test that location dropdowns still work")

    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        print("Please check your Firebase connection and try again.")