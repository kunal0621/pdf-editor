import json
import boto3
from botocore.exceptions import ClientError
from app.config import settings

class StorageService:
    def __init__(self) -> None:
        if settings.s3_endpoint_url:
            self.s3_client = boto3.client(
                's3',
                endpoint_url=settings.s3_endpoint_url,
                aws_access_key_id=settings.s3_access_key_id,
                aws_secret_access_key=settings.s3_secret_access_key,
                region_name=settings.s3_region
            )
        else:
            self.s3_client = None
        self.bucket = settings.s3_bucket_name

    def _get_key(self, user_id: str, document_id: str, filename: str) -> str:
        return f"{user_id}/{document_id}/{filename}"

    def write_bytes(self, user_id: str, document_id: str, filename: str, content: bytes) -> None:
        if not self.s3_client:
            return
        key = self._get_key(user_id, document_id, filename)
        self.s3_client.put_object(Bucket=self.bucket, Key=key, Body=content)

    def read_bytes(self, user_id: str, document_id: str, filename: str) -> bytes:
        if not self.s3_client:
            return b""
        key = self._get_key(user_id, document_id, filename)
        response = self.s3_client.get_object(Bucket=self.bucket, Key=key)
        return response['Body'].read()

    def write_json(self, user_id: str, document_id: str, filename: str, payload: dict | list) -> None:
        content = json.dumps(payload, indent=2).encode('utf-8')
        self.write_bytes(user_id, document_id, filename, content)

    def read_json(self, user_id: str, document_id: str, filename: str) -> dict | list:
        content = self.read_bytes(user_id, document_id, filename)
        return json.loads(content.decode('utf-8'))

    def exists(self, user_id: str, document_id: str, filename: str) -> bool:
        if not self.s3_client:
            return False
        key = self._get_key(user_id, document_id, filename)
        try:
            self.s3_client.head_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                return False
            raise

    def cleanup_document(self, user_id: str, document_id: str) -> None:
        if not self.s3_client:
            return
        prefix = f"{user_id}/{document_id}/"
        paginator = self.s3_client.get_paginator('list_objects_v2')
        pages = paginator.paginate(Bucket=self.bucket, Prefix=prefix)
        
        objects_to_delete = []
        for page in pages:
            if 'Contents' in page:
                for obj in page['Contents']:
                    if obj.get('Key'):
                        objects_to_delete.append({'Key': obj['Key']})
                    
        # Batch delete in chunks of 1000 (S3 limit)
        for i in range(0, len(objects_to_delete), 1000):
            chunk = objects_to_delete[i:i + 1000]
            try:
                self.s3_client.delete_objects(Bucket=self.bucket, Delete={'Objects': chunk})
            except ClientError:
                # Log or handle appropriately; here we just want to ensure it tries even if one chunk fails
                pass

    def list_documents(self, user_id: str) -> list[str]:
        if not self.s3_client:
            return []
        prefix = f"{user_id}/"
        paginator = self.s3_client.get_paginator('list_objects_v2')
        result_pages = paginator.paginate(Bucket=self.bucket, Prefix=prefix, Delimiter='/')
        document_ids = []
        for page in result_pages:
            if 'CommonPrefixes' in page:
                for prefix_obj in page['CommonPrefixes']:
                    # doc_path is "user_id/doc_id/"
                    doc_path = prefix_obj['Prefix']
                    doc_id = doc_path.replace(prefix, "").strip("/")
                    if doc_id and self.exists(user_id, doc_id, "manifest.json"):
                        document_ids.append(doc_id)
        return document_ids

    def generate_presigned_url(self, user_id: str, document_id: str, filename: str) -> str:
        if not self.s3_client:
            return ""
        key = self._get_key(user_id, document_id, filename)
        url = self.s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': self.bucket, 'Key': key},
            ExpiresIn=3600
        )
        return url

storage_service = StorageService()
