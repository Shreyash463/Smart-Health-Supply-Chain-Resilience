import os
import json
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

logger = logging.getLogger("health_resilience.database")

class Database:
    def __init__(self):
        self.is_firestore: bool = False
        self.firestore_client = None
        self._local_data: Dict[str, Dict[str, Any]] = {
            "phcs": {},
            "medicines": {},
            "stock": {},
            "footfall": {},
            "staff_attendance": {},
            "alerts": {}
        }
        self._local_storage_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "local_db.json")
        self._init_backend()

    def _init_backend(self):
        cred_env = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
        google_app_cred = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()

        # Try initializing Firestore if credentials are provided
        if cred_env or google_app_cred:
            try:
                import firebase_admin
                from firebase_admin import credentials, firestore

                # Avoid re-initialization if app already exists
                if not firebase_admin._apps:
                    if cred_env:
                        if cred_env.startswith("{"):
                            cred_info = json.loads(cred_env)
                            cred = credentials.Certificate(cred_info)
                        elif os.path.exists(cred_env):
                            cred = credentials.Certificate(cred_env)
                        else:
                            raise FileNotFoundError(f"Service account file not found: {cred_env}")
                        firebase_admin.initialize_app(cred)
                    elif google_app_cred and os.path.exists(google_app_cred):
                        cred = credentials.Certificate(google_app_cred)
                        firebase_admin.initialize_app(cred)
                    else:
                        firebase_admin.initialize_app()
                
                self.firestore_client = firestore.client()
                self.is_firestore = True
                logger.info("Successfully connected to live Firebase Firestore.")
                print("Firebase Firestore connection established.")
                return
            except Exception as e:
                logger.warning(f"Could not initialize Firebase Firestore ({e}). Using resilient local storage.")
                print(f"Firebase Firestore init warning: {e}. Active mode: Local Resilient Storage.")

        # Fallback to local persistent JSON store
        self._load_local_data()
        logger.info("Running in resilient local storage mode.")

    def _load_local_data(self):
        os.makedirs(os.path.dirname(self._local_storage_path), exist_ok=True)
        if os.path.exists(self._local_storage_path):
            try:
                with open(self._local_storage_path, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                    for col, items in loaded.items():
                        if col in self._local_data:
                            self._local_data[col] = items
                logger.info("Loaded local database from disk.")
            except Exception as e:
                logger.error(f"Failed to read local data file: {e}")

    def _save_local_data(self):
        if self.is_firestore:
            return
        try:
            os.makedirs(os.path.dirname(self._local_storage_path), exist_ok=True)
            with open(self._local_storage_path, "w", encoding="utf-8") as f:
                json.dump(self._local_data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save local data to disk: {e}")

    # Universal Collection CRUD operations
    def get_document(self, collection: str, doc_id: str) -> Optional[Dict[str, Any]]:
        if self.is_firestore and self.firestore_client:
            try:
                doc = self.firestore_client.collection(collection).document(str(doc_id)).get()
                if doc.exists:
                    data = doc.to_dict()
                    if "id" not in data:
                        data["id"] = doc.id
                    return data
                return None
            except Exception as e:
                logger.error(f"Firestore get_document error: {e}")
                return None
        return self._local_data.get(collection, {}).get(str(doc_id))

    def set_document(self, collection: str, doc_id: str, data: Dict[str, Any]) -> bool:
        doc_id = str(doc_id)
        if "id" not in data:
            data["id"] = doc_id

        if self.is_firestore and self.firestore_client:
            try:
                self.firestore_client.collection(collection).document(doc_id).set(data)
                return True
            except Exception as e:
                logger.error(f"Firestore set_document error: {e}")
                # Fall through to save locally as resilience fallback
        
        if collection not in self._local_data:
            self._local_data[collection] = {}
        self._local_data[collection][doc_id] = data
        self._save_local_data()
        return True

    def list_documents(self, collection: str) -> List[Dict[str, Any]]:
        if self.is_firestore and self.firestore_client:
            try:
                docs = self.firestore_client.collection(collection).stream()
                results = []
                for d in docs:
                    item = d.to_dict()
                    if "id" not in item:
                        item["id"] = d.id
                    results.append(item)
                return results
            except Exception as e:
                logger.error(f"Firestore list_documents error: {e}")
        return list(self._local_data.get(collection, {}).values())

    def query_documents(self, collection: str, filters: Dict[str, Any]) -> List[Dict[str, Any]]:
        if self.is_firestore and self.firestore_client:
            try:
                ref = self.firestore_client.collection(collection)
                for key, val in filters.items():
                    ref = ref.where(key, "==", val)
                docs = ref.stream()
                results = []
                for d in docs:
                    item = d.to_dict()
                    if "id" not in item:
                        item["id"] = d.id
                    results.append(item)
                return results
            except Exception as e:
                logger.error(f"Firestore query_documents error: {e}")

        # Local query matching
        results = []
        for item in self._local_data.get(collection, {}).values():
            match = True
            for k, v in filters.items():
                if item.get(k) != v:
                    match = False
                    break
            if match:
                results.append(item)
        return results

    def update_document(self, collection: str, doc_id: str, updates: Dict[str, Any]) -> bool:
        doc_id = str(doc_id)
        if self.is_firestore and self.firestore_client:
            try:
                self.firestore_client.collection(collection).document(doc_id).update(updates)
                return True
            except Exception as e:
                logger.error(f"Firestore update_document error: {e}")

        if collection in self._local_data and doc_id in self._local_data[collection]:
            self._local_data[collection][doc_id].update(updates)
            self._save_local_data()
            return True
        return False

# Global database instance
db = Database()
