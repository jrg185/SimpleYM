# Backend/verify_user_creation.py
# Run this script to verify user creation functionality

import firebase_admin
from firebase_admin import credentials, auth, firestore


def verify_user_creation():
    """
    Verification script to test user creation in both Firebase Auth and Firestore
    """

    # Initialize Firebase (if not already done)
    if not firebase_admin._apps:
        cred = credentials.Certificate("service_account.json")
        firebase_admin.initialize_app(cred)

    db = firestore.client()

    # Test user data
    test_email = "test.user@example.com"
    test_password = "TestPassword123!"
    test_name = "Test User"
    test_role = "admin"
    test_permissions = "read"

    print("Starting user creation verification...")

    try:
        # Step 1: Create Firebase Auth user
        print(f"1. Creating Firebase Auth user for {test_email}...")
        auth_user = auth.create_user(
            email=test_email,
            password=test_password,
            display_name=test_name,
        )
        print(f"✅ Firebase Auth user created with UID: {auth_user.uid}")

        # Step 2: Add to Firestore
        print("2. Adding user to Firestore...")
        user_data = {
            "id": auth_user.uid,
            "name": test_name,
            "email": test_email,
            "role": test_role,
            "permissions": test_permissions,
        }

        db.collection("user_master").document(auth_user.uid).set(user_data)
        print("✅ User added to Firestore")

        # Step 3: Verify Firestore data
        print("3. Verifying Firestore data...")
        doc_ref = db.collection("user_master").document(auth_user.uid)
        doc = doc_ref.get()

        if doc.exists:
            stored_data = doc.to_dict()
            print(f"✅ User data retrieved from Firestore: {stored_data}")
        else:
            print("❌ User data not found in Firestore")
            return False

        # Step 4: Verify Firebase Auth
        print("4. Verifying Firebase Auth...")
        retrieved_user = auth.get_user(auth_user.uid)
        print(f"✅ User retrieved from Firebase Auth: {retrieved_user.email}")

        print("\n🎉 User creation verification completed successfully!")
        print(f"User {test_email} exists in both Firebase Auth and Firestore")

        # Cleanup (optional)
        cleanup = input("\nDelete test user? (y/n): ")
        if cleanup.lower() == 'y':
            auth.delete_user(auth_user.uid)
            doc_ref.delete()
            print("🗑️ Test user cleaned up")

        return True

    except auth.EmailAlreadyExistsError:
        print(f"❌ User {test_email} already exists in Firebase Auth")
        print("Please delete the test user first or use a different email")
        return False

    except Exception as e:
        print(f"❌ Error during verification: {str(e)}")
        print(f"Error type: {type(e)}")
        return False


def check_existing_users():
    """
    Check existing users in both Firebase Auth and Firestore
    """
    if not firebase_admin._apps:
        cred = credentials.Certificate("service_account.json")
        firebase_admin.initialize_app(cred)

    db = firestore.client()

    print("Checking existing users...")

    # Get users from Firestore
    print("\n📁 Users in Firestore (user_master collection):")
    users_collection = db.collection("user_master").stream()
    firestore_emails = []

    for doc in users_collection:
        user_data = doc.to_dict()
        email = user_data.get('email', 'No email')
        firestore_emails.append(email)
        print(f"  - {email} (Role: {user_data.get('role', 'Unknown')})")

    # Get users from Firebase Auth
    print("\n🔐 Users in Firebase Auth:")
    auth_emails = []
    try:
        page = auth.list_users()
        while page:
            for user in page.users:
                auth_emails.append(user.email)
                print(f"  - {user.email} (UID: {user.uid})")
            page = page.get_next_page()
    except Exception as e:
        print(f"Error listing Auth users: {e}")

    # Compare
    print(f"\n📊 Summary:")
    print(f"Users in Firestore: {len(firestore_emails)}")
    print(f"Users in Firebase Auth: {len(auth_emails)}")

    # Find discrepancies
    only_in_firestore = set(firestore_emails) - set(auth_emails)
    only_in_auth = set(auth_emails) - set(firestore_emails)

    if only_in_firestore:
        print(f"\n⚠️  Users only in Firestore: {list(only_in_firestore)}")

    if only_in_auth:
        print(f"\n⚠️  Users only in Firebase Auth: {list(only_in_auth)}")

    if not only_in_firestore and not only_in_auth:
        print("✅ All users are synchronized between Firebase Auth and Firestore")


if __name__ == "__main__":
    print("User Creation Verification Tool")
    print("=" * 40)

    choice = input("Choose option:\n1. Verify user creation process\n2. Check existing users\nEnter choice (1 or 2): ")

    if choice == "1":
        verify_user_creation()
    elif choice == "2":
        check_existing_users()
    else:
        print("Invalid choice")