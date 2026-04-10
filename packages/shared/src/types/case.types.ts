export type CaseStatus = 'Open' | 'Active' | 'Pending' | 'Closed' | 'Archived';
export type CasePriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export interface Case {
  id: string;
  title: string;
  description?: string;
  status: CaseStatus;
  priority: CasePriority;
  lawyerId: string;
  clientId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Document {
  id: string;
  caseId: string;
  name: string;
  type: string;
  url: string;
  uploadedBy: string;
  createdAt: string;
}
