export class DocumentAccessClient {
  private readonly baseUrl: string;

  constructor(apiBaseUrl: string) {
    this.baseUrl = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
  }

  public async getAccessLevel(documentId: string, accessToken?: string): Promise<string | null> {
    if (!accessToken || !accessToken.trim()) {
      return null;
    }

    const url = `${this.baseUrl}/api/documents/${encodeURIComponent(documentId)}/access`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });

      if (response.status === 404 || response.status === 401 || response.status === 403) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Unexpected status code: ${response.status}`);
      }

      const body = (await response.json()) as { accessLevel?: string; AccessLevel?: string };
      return body.accessLevel || body.AccessLevel || null;
    } catch (error) {
      console.error(`Could not validate access to document ${documentId}:`, error);
      return null;
    }
  }

  public async saveDocumentContent(documentId: string, content: string, accessToken: string): Promise<boolean> {
    if (!accessToken || !accessToken.trim()) {
      return false;
    }

    const url = `${this.baseUrl}/api/documents/${encodeURIComponent(documentId)}/content`;
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        console.warn(`Write-Back flush failed for document ${documentId} with status ${response.status}`);
        return false;
      }

      return true;
    } catch (error) {
      console.error(`Could not save content for document ${documentId} to PostgreSQL:`, error);
      return false;
    }
  }
}
