
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "admin_audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"details": NonNullable<Json>,"id": number,"org_id": string,"target_user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"id"?: never,"org_id": string,"target_user_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"id"?: never,"org_id"?: string,"target_user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "admin_audit_logs_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "admin_audit_logs_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "admin_audit_logs_target_user_id_fkey"
      columns: ["target_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"avatar_appearance": {
                  Row: {
                    "accessory": string,"bottom": string,"eyes": string,"face": string,"glasses": string,"hair": string,"hair_color": string,"mouth": string,"nose": string,"org_id": string,"shoes": string,"skin": string,"top": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accessory"?: string,"bottom"?: string,"eyes"?: string,"face"?: string,"glasses"?: string,"hair"?: string,"hair_color"?: string,"mouth"?: string,"nose"?: string,"org_id": string,"shoes"?: string,"skin"?: string,"top"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "accessory"?: string,"bottom"?: string,"eyes"?: string,"face"?: string,"glasses"?: string,"hair"?: string,"hair_color"?: string,"mouth"?: string,"nose"?: string,"org_id"?: string,"shoes"?: string,"skin"?: string,"top"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "avatar_appearance_user_id_org_id_fkey"
      columns: ["user_id","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"chat_media_tombstones": {
                  Row: {
                    "created_at": string,"expired_at": string,"path": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expired_at": string,"path": string
                  }
                  Update: {
                    "created_at"?: string,"expired_at"?: string,"path"?: string
                  }
                  Relationships: [
                    
                  ]
                },"chat_messages": {
                  Row: {
                    "body": string | null,"created_at": string,"expires_at": string,"id": string,"is_anonymous": boolean,"kind": Database["public"]['Enums']["chat_kind"],"media_path": string | null,"mentions": (string)[],"org_id": string,"sender_id": string,"sticker": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"expires_at"?: string,"id"?: string,"is_anonymous"?: boolean,"kind"?: Database["public"]['Enums']["chat_kind"],"media_path"?: string | null,"mentions"?: (string)[],"org_id": string,"sender_id": string,"sticker"?: string | null
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"expires_at"?: string,"id"?: string,"is_anonymous"?: boolean,"kind"?: Database["public"]['Enums']["chat_kind"],"media_path"?: string | null,"mentions"?: (string)[],"org_id"?: string,"sender_id"?: string,"sticker"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_messages_sender_id_org_id_fkey"
      columns: ["sender_id","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"chat_reactions": {
                  Row: {
                    "created_at": string,"emoji": string,"message_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"emoji": string,"message_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"emoji"?: string,"message_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_reactions_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "chat_messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chat_reactions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"company_holidays": {
                  Row: {
                    "created_at": string,"holiday_on": string,"id": string,"name": string,"org_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"holiday_on": string,"id"?: string,"name": string,"org_id": string
                  }
                  Update: {
                    "created_at"?: string,"holiday_on"?: string,"id"?: string,"name"?: string,"org_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "company_holidays_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"invites": {
                  Row: {
                    "accepted_at": string | null,"accepted_user_id": string | null,"created_at": string,"email": string,"expires_at": string,"full_name": string,"id": string,"invited_by": string | null,"org_id": string,"revoked_at": string | null,"role": Database["public"]['Enums']["app_role"],"team_id": string | null,"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_user_id"?: string | null,"created_at"?: string,"email": string,"expires_at": string,"full_name": string,"id"?: string,"invited_by"?: string | null,"org_id": string,"revoked_at"?: string | null,"role": Database["public"]['Enums']["app_role"],"team_id"?: string | null,"token_hash": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_user_id"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"full_name"?: string,"id"?: string,"invited_by"?: string | null,"org_id"?: string,"revoked_at"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"team_id"?: string | null,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invites_invited_by_org_id_fkey"
      columns: ["invited_by","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "invites_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invites_team_id_org_id_fkey"
      columns: ["team_id","org_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"job_runs": {
                  Row: {
                    "affected": number | null,"error": string | null,"finished_at": string | null,"id": number,"job": string,"started_at": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "affected"?: number | null,"error"?: string | null,"finished_at"?: string | null,"id"?: never,"job": string,"started_at"?: string,"status"?: string
                  }
                  Update: {
                    "affected"?: number | null,"error"?: string | null,"finished_at"?: string | null,"id"?: never,"job"?: string,"started_at"?: string,"status"?: string
                  }
                  Relationships: [
                    
                  ]
                },"meeting_action_items": {
                  Row: {
                    "assigned_at": string | null,"assigned_by": string | null,"created_at": string,"created_by": string,"description": string | null,"id": string,"meeting_id": string,"org_id": string,"status": Database["public"]['Enums']["action_item_status"],"task_id": string | null,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_at"?: string | null,"assigned_by"?: string | null,"created_at"?: string,"created_by": string,"description"?: string | null,"id"?: string,"meeting_id": string,"org_id": string,"status"?: Database["public"]['Enums']["action_item_status"],"task_id"?: string | null,"title": string
                  }
                  Update: {
                    "assigned_at"?: string | null,"assigned_by"?: string | null,"created_at"?: string,"created_by"?: string,"description"?: string | null,"id"?: string,"meeting_id"?: string,"org_id"?: string,"status"?: Database["public"]['Enums']["action_item_status"],"task_id"?: string | null,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meeting_action_items_assigned_by_org_id_fkey"
      columns: ["assigned_by","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "meeting_action_items_created_by_org_id_fkey"
      columns: ["created_by","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "meeting_action_items_meeting_id_org_id_fkey"
      columns: ["meeting_id","org_id"]
isOneToOne: false
      referencedRelation: "meetings"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "meeting_action_items_task_id_org_id_fkey"
      columns: ["task_id","org_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"meeting_attendees": {
                  Row: {
                    "is_proxy": boolean,"meeting_id": string,"org_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "is_proxy"?: boolean,"meeting_id": string,"org_id": string,"user_id": string
                  }
                  Update: {
                    "is_proxy"?: boolean,"meeting_id"?: string,"org_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meeting_attendees_meeting_id_org_id_fkey"
      columns: ["meeting_id","org_id"]
isOneToOne: false
      referencedRelation: "meetings"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "meeting_attendees_user_id_org_id_fkey"
      columns: ["user_id","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"meetings": {
                  Row: {
                    "created_at": string,"created_by": string,"ends_at": string,"id": string,"org_id": string,"starts_at": string,"summary": string | null,"team_id": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by": string,"ends_at": string,"id"?: string,"org_id": string,"starts_at": string,"summary"?: string | null,"team_id": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"ends_at"?: string,"id"?: string,"org_id"?: string,"starts_at"?: string,"summary"?: string | null,"team_id"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meetings_created_by_org_id_fkey"
      columns: ["created_by","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "meetings_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meetings_team_id_org_id_fkey"
      columns: ["team_id","org_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"member_absences": {
                  Row: {
                    "created_at": string,"ends_on": string,"id": string,"org_id": string,"part": Database["public"]['Enums']["absence_part"],"reason": string | null,"starts_on": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"ends_on": string,"id"?: string,"org_id": string,"part"?: Database["public"]['Enums']["absence_part"],"reason"?: string | null,"starts_on": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"ends_on"?: string,"id"?: string,"org_id"?: string,"part"?: Database["public"]['Enums']["absence_part"],"reason"?: string | null,"starts_on"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "member_absences_user_id_org_id_fkey"
      columns: ["user_id","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"member_skills": {
                  Row: {
                    "level": number,"org_id": string,"skill_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "level": number,"org_id": string,"skill_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "level"?: number,"org_id"?: string,"skill_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "member_skills_skill_id_org_id_fkey"
      columns: ["skill_id","org_id"]
isOneToOne: false
      referencedRelation: "skills"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "member_skills_user_id_org_id_fkey"
      columns: ["user_id","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"dedupe_key": string | null,"id": string,"kind": string,"meeting_id": string | null,"org_id": string,"payload": NonNullable<Json>,"read_at": string | null,"task_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"dedupe_key"?: string | null,"id"?: string,"kind": string,"meeting_id"?: string | null,"org_id": string,"payload"?: NonNullable<Json>,"read_at"?: string | null,"task_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"dedupe_key"?: string | null,"id"?: string,"kind"?: string,"meeting_id"?: string | null,"org_id"?: string,"payload"?: NonNullable<Json>,"read_at"?: string | null,"task_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_actor_id_org_id_fkey"
      columns: ["actor_id","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "notifications_meeting_id_org_id_fkey"
      columns: ["meeting_id","org_id"]
isOneToOne: false
      referencedRelation: "meetings"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "notifications_task_id_org_id_fkey"
      columns: ["task_id","org_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "notifications_user_id_org_id_fkey"
      columns: ["user_id","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"office_status": {
                  Row: {
                    "note": string | null,"org_id": string,"status": Database["public"]['Enums']["office_status_kind"],"until": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "note"?: string | null,"org_id": string,"status"?: Database["public"]['Enums']["office_status_kind"],"until"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "note"?: string | null,"org_id"?: string,"status"?: Database["public"]['Enums']["office_status_kind"],"until"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "office_status_user_id_org_id_fkey"
      columns: ["user_id","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"timezone": string,"work_days": (number)[],"work_end": string,"work_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"timezone"?: string,"work_days"?: (number)[],"work_end"?: string,"work_start"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"timezone"?: string,"work_days"?: (number)[],"work_end"?: string,"work_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"pets": {
                  Row: {
                    "breed": string,"color": string,"name": string,"org_id": string,"outfit": string,"sound_enabled": boolean,"species": Database["public"]['Enums']["pet_species"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "breed": string,"color": string,"name": string,"org_id": string,"outfit"?: string,"sound_enabled"?: boolean,"species": Database["public"]['Enums']["pet_species"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "breed"?: string,"color"?: string,"name"?: string,"org_id"?: string,"outfit"?: string,"sound_enabled"?: boolean,"species"?: Database["public"]['Enums']["pet_species"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pets_user_id_org_id_fkey"
      columns: ["user_id","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "chat_effects": boolean,"created_at": string,"deactivated_at": string | null,"email": string,"full_name": string,"id": string,"is_active": boolean,"job_title": string | null,"locale": string,"nickname": string | null,"onboarding_completed_at": string | null,"org_id": string,"reduce_motion": boolean,"role": Database["public"]['Enums']["app_role"],"sound_enabled": boolean,"theme": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chat_effects"?: boolean,"created_at"?: string,"deactivated_at"?: string | null,"email": string,"full_name": string,"id": string,"is_active"?: boolean,"job_title"?: string | null,"locale"?: string,"nickname"?: string | null,"onboarding_completed_at"?: string | null,"org_id": string,"reduce_motion"?: boolean,"role": Database["public"]['Enums']["app_role"],"sound_enabled"?: boolean,"theme"?: string,"updated_at"?: string
                  }
                  Update: {
                    "chat_effects"?: boolean,"created_at"?: string,"deactivated_at"?: string | null,"email"?: string,"full_name"?: string,"id"?: string,"is_active"?: boolean,"job_title"?: string | null,"locale"?: string,"nickname"?: string | null,"onboarding_completed_at"?: string | null,"org_id"?: string,"reduce_motion"?: boolean,"role"?: Database["public"]['Enums']["app_role"],"sound_enabled"?: boolean,"theme"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"projects": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"created_by": string,"description": string | null,"id": string,"name": string,"org_id": string,"team_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by": string,"description"?: string | null,"id"?: string,"name": string,"org_id": string,"team_id": string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string,"description"?: string | null,"id"?: string,"name"?: string,"org_id"?: string,"team_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "projects_created_by_org_id_fkey"
      columns: ["created_by","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "projects_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_team_id_org_id_fkey"
      columns: ["team_id","org_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"skills": {
                  Row: {
                    "created_at": string,"id": string,"name_en": string,"name_th": string,"org_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name_en": string,"name_th": string,"org_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name_en"?: string,"name_th"?: string,"org_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "skills_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"task_assignees": {
                  Row: {
                    "assigned_at": string,"assigned_by": string | null,"is_primary": boolean,"org_id": string,"task_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_at"?: string,"assigned_by"?: string | null,"is_primary"?: boolean,"org_id": string,"task_id": string,"user_id": string
                  }
                  Update: {
                    "assigned_at"?: string,"assigned_by"?: string | null,"is_primary"?: boolean,"org_id"?: string,"task_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_assignees_assigned_by_org_id_fkey"
      columns: ["assigned_by","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "task_assignees_task_id_org_id_fkey"
      columns: ["task_id","org_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "task_assignees_user_id_org_id_fkey"
      columns: ["user_id","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"task_attachments": {
                  Row: {
                    "created_at": string,"file_key": string,"file_name": string,"id": string,"mime_type": string | null,"org_id": string,"size_bytes": number | null,"storage_path": string,"submission_id": string | null,"task_id": string,"uploaded_by": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"file_key": string,"file_name": string,"id"?: string,"mime_type"?: string | null,"org_id": string,"size_bytes"?: number | null,"storage_path": string,"submission_id"?: string | null,"task_id": string,"uploaded_by": string,"version": number
                  }
                  Update: {
                    "created_at"?: string,"file_key"?: string,"file_name"?: string,"id"?: string,"mime_type"?: string | null,"org_id"?: string,"size_bytes"?: number | null,"storage_path"?: string,"submission_id"?: string | null,"task_id"?: string,"uploaded_by"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_attachments_submission_id_org_id_fkey"
      columns: ["submission_id","org_id"]
isOneToOne: false
      referencedRelation: "task_submissions"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "task_attachments_task_id_org_id_fkey"
      columns: ["task_id","org_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "task_attachments_uploaded_by_org_id_fkey"
      columns: ["uploaded_by","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"task_audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"details": NonNullable<Json>,"id": number,"org_id": string,"task_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"id"?: never,"org_id": string,"task_id": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"id"?: never,"org_id"?: string,"task_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_audit_logs_actor_id_org_id_fkey"
      columns: ["actor_id","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "task_audit_logs_task_id_org_id_fkey"
      columns: ["task_id","org_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"task_categories": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"name_en": string,"name_th": string,"org_id": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name_en": string,"name_th": string,"org_id": string,"sort_order"?: number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name_en"?: string,"name_th"?: string,"org_id"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_categories_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"task_change_requests": {
                  Row: {
                    "created_at": string,"current_due_at": string | null,"decided_at": string | null,"decided_by": string | null,"decision_note": string | null,"id": string,"org_id": string,"proposed_due_at": string,"reason": string,"requested_by": string,"status": Database["public"]['Enums']["change_request_status"],"task_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"current_due_at"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"id"?: string,"org_id": string,"proposed_due_at": string,"reason": string,"requested_by": string,"status"?: Database["public"]['Enums']["change_request_status"],"task_id": string
                  }
                  Update: {
                    "created_at"?: string,"current_due_at"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"id"?: string,"org_id"?: string,"proposed_due_at"?: string,"reason"?: string,"requested_by"?: string,"status"?: Database["public"]['Enums']["change_request_status"],"task_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_change_requests_decided_by_org_id_fkey"
      columns: ["decided_by","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "task_change_requests_requested_by_org_id_fkey"
      columns: ["requested_by","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "task_change_requests_task_id_org_id_fkey"
      columns: ["task_id","org_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"task_checklist_items": {
                  Row: {
                    "created_at": string,"created_by": string,"done_at": string | null,"done_by": string | null,"id": string,"is_done": boolean,"org_id": string,"position": number,"task_id": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by": string,"done_at"?: string | null,"done_by"?: string | null,"id"?: string,"is_done"?: boolean,"org_id": string,"position"?: number,"task_id": string,"title": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"done_at"?: string | null,"done_by"?: string | null,"id"?: string,"is_done"?: boolean,"org_id"?: string,"position"?: number,"task_id"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_checklist_items_created_by_org_id_fkey"
      columns: ["created_by","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "task_checklist_items_done_by_org_id_fkey"
      columns: ["done_by","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "task_checklist_items_task_id_org_id_fkey"
      columns: ["task_id","org_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"task_comments": {
                  Row: {
                    "author_id": string,"body": string,"created_at": string,"id": string,"mentions": (string)[],"org_id": string,"task_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"body": string,"created_at"?: string,"id"?: string,"mentions"?: (string)[],"org_id": string,"task_id": string
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"created_at"?: string,"id"?: string,"mentions"?: (string)[],"org_id"?: string,"task_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_comments_author_id_org_id_fkey"
      columns: ["author_id","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "task_comments_task_id_org_id_fkey"
      columns: ["task_id","org_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"task_recurrence_rules": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string,"day_of_month": number | null,"due_time": string,"freq": Database["public"]['Enums']["recurrence_freq"],"id": string,"interval_n": number,"next_run_on": string | null,"org_id": string,"starts_on": string,"template_task_id": string,"until_on": string | null,"weekdays": (number)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by": string,"day_of_month"?: number | null,"due_time"?: string,"freq": Database["public"]['Enums']["recurrence_freq"],"id"?: string,"interval_n"?: number,"next_run_on"?: string | null,"org_id": string,"starts_on": string,"template_task_id": string,"until_on"?: string | null,"weekdays"?: (number)[]
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string,"day_of_month"?: number | null,"due_time"?: string,"freq"?: Database["public"]['Enums']["recurrence_freq"],"id"?: string,"interval_n"?: number,"next_run_on"?: string | null,"org_id"?: string,"starts_on"?: string,"template_task_id"?: string,"until_on"?: string | null,"weekdays"?: (number)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_recurrence_rules_created_by_org_id_fkey"
      columns: ["created_by","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "task_recurrence_rules_template_task_id_org_id_fkey"
      columns: ["template_task_id","org_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"task_reviews": {
                  Row: {
                    "comment": string | null,"created_at": string,"decision": Database["public"]['Enums']["review_decision"],"id": string,"org_id": string,"reviewer_id": string,"submission_id": string,"task_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "comment"?: string | null,"created_at"?: string,"decision": Database["public"]['Enums']["review_decision"],"id"?: string,"org_id": string,"reviewer_id": string,"submission_id": string,"task_id": string
                  }
                  Update: {
                    "comment"?: string | null,"created_at"?: string,"decision"?: Database["public"]['Enums']["review_decision"],"id"?: string,"org_id"?: string,"reviewer_id"?: string,"submission_id"?: string,"task_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_reviews_reviewer_id_org_id_fkey"
      columns: ["reviewer_id","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "task_reviews_submission_id_org_id_fkey"
      columns: ["submission_id","org_id"]
isOneToOne: false
      referencedRelation: "task_submissions"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "task_reviews_task_id_org_id_fkey"
      columns: ["task_id","org_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"task_submissions": {
                  Row: {
                    "created_at": string,"id": string,"note": string | null,"org_id": string,"review_level": Database["public"]['Enums']["review_level"],"submitted_by": string,"task_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"note"?: string | null,"org_id": string,"review_level": Database["public"]['Enums']["review_level"],"submitted_by": string,"task_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"note"?: string | null,"org_id"?: string,"review_level"?: Database["public"]['Enums']["review_level"],"submitted_by"?: string,"task_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_submissions_submitted_by_org_id_fkey"
      columns: ["submitted_by","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "task_submissions_task_id_org_id_fkey"
      columns: ["task_id","org_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"task_tag_links": {
                  Row: {
                    "org_id": string,"tag_id": string,"task_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "org_id": string,"tag_id": string,"task_id": string
                  }
                  Update: {
                    "org_id"?: string,"tag_id"?: string,"task_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_tag_links_tag_id_org_id_fkey"
      columns: ["tag_id","org_id"]
isOneToOne: false
      referencedRelation: "task_tags"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "task_tag_links_task_id_org_id_fkey"
      columns: ["task_id","org_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"task_tags": {
                  Row: {
                    "color": string,"created_at": string,"id": string,"is_active": boolean,"name": string,"org_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"org_id": string
                  }
                  Update: {
                    "color"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"org_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_tags_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "archived_at": string | null,"archived_by": string | null,"category_id": string | null,"completed_at": string | null,"created_at": string,"created_by": string,"description": string | null,"due_at": string | null,"estimated_hours": number | null,"id": string,"is_private": boolean,"is_urgent": boolean,"org_id": string,"parent_task_id": string | null,"priority": Database["public"]['Enums']["task_priority"],"project_id": string | null,"recurrence_on": string | null,"recurrence_rule_id": string | null,"reminder_days": number,"size": Database["public"]['Enums']["task_size"] | null,"source_action_item_id": string | null,"status": Database["public"]['Enums']["task_status"],"team_id": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"archived_by"?: string | null,"category_id"?: string | null,"completed_at"?: string | null,"created_at"?: string,"created_by": string,"description"?: string | null,"due_at"?: string | null,"estimated_hours"?: number | null,"id"?: string,"is_private"?: boolean,"is_urgent"?: boolean,"org_id": string,"parent_task_id"?: string | null,"priority"?: Database["public"]['Enums']["task_priority"],"project_id"?: string | null,"recurrence_on"?: string | null,"recurrence_rule_id"?: string | null,"reminder_days"?: number,"size"?: Database["public"]['Enums']["task_size"] | null,"source_action_item_id"?: string | null,"status"?: Database["public"]['Enums']["task_status"],"team_id": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"archived_by"?: string | null,"category_id"?: string | null,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string,"description"?: string | null,"due_at"?: string | null,"estimated_hours"?: number | null,"id"?: string,"is_private"?: boolean,"is_urgent"?: boolean,"org_id"?: string,"parent_task_id"?: string | null,"priority"?: Database["public"]['Enums']["task_priority"],"project_id"?: string | null,"recurrence_on"?: string | null,"recurrence_rule_id"?: string | null,"reminder_days"?: number,"size"?: Database["public"]['Enums']["task_size"] | null,"source_action_item_id"?: string | null,"status"?: Database["public"]['Enums']["task_status"],"team_id"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_archived_by_org_id_fkey"
      columns: ["archived_by","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "tasks_category_id_org_id_fkey"
      columns: ["category_id","org_id"]
isOneToOne: false
      referencedRelation: "task_categories"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "tasks_created_by_org_id_fkey"
      columns: ["created_by","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "tasks_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_parent_task_id_org_id_fkey"
      columns: ["parent_task_id","org_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "tasks_project_id_org_id_fkey"
      columns: ["project_id","org_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "tasks_recurrence_rule_fk"
      columns: ["recurrence_rule_id","org_id"]
isOneToOne: false
      referencedRelation: "task_recurrence_rules"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "tasks_source_action_item_fk"
      columns: ["source_action_item_id","org_id"]
isOneToOne: false
      referencedRelation: "meeting_action_items"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "tasks_team_id_org_id_fkey"
      columns: ["team_id","org_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"team_members": {
                  Row: {
                    "created_at": string,"is_lead": boolean,"org_id": string,"team_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"is_lead"?: boolean,"org_id": string,"team_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"is_lead"?: boolean,"org_id"?: string,"team_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "team_members_team_id_org_id_fkey"
      columns: ["team_id","org_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "team_members_user_id_org_id_fkey"
      columns: ["user_id","org_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"teams": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"org_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"org_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"org_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "teams_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "absence_calendar":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "ends_on": string,"id": string,"part": Database["public"]['Enums']["absence_part"],"starts_on": string,"user_id": string
            }[]
                           },
"add_checklist_item":
{ Args: { "p_task_id": string,"p_title": string }; Returns: string
                           },
"add_meeting_notes":
{ Args: { "p_action_items"?: (string)[],"p_meeting_id": string,"p_note"?: string }; Returns: number
                           },
"add_task_comment":
{ Args: { "p_body": string,"p_mentions"?: (string)[],"p_task_id": string }; Returns: string
                           },
"add_task_files":
{ Args: { "p_attachments": Json,"p_task_id": string }; Returns: number
                           },
"admin_chat_identity":
{ Args: { "p_message_id": string }; Returns: {
              "sender_id": string,"sender_name": string
            }[]
                           },
"admin_create_invite":
{ Args: { "p_email": string,"p_expires_at"?: string,"p_full_name": string,"p_role": Database["public"]['Enums']["app_role"],"p_team_id": string,"p_token_hash": string }; Returns: string
                           },
"admin_revoke_invite":
{ Args: { "p_invite_id": string }; Returns: undefined
                           },
"admin_set_team_membership":
{ Args: { "p_is_lead"?: boolean,"p_is_member": boolean,"p_team_id": string,"p_user_id": string }; Returns: undefined
                           },
"admin_set_user_active":
{ Args: { "p_active": boolean,"p_user_id": string }; Returns: undefined
                           },
"admin_set_user_role":
{ Args: { "p_role": Database["public"]['Enums']["app_role"],"p_user_id": string }; Returns: undefined
                           },
"assign_action_item":
{ Args: { "p_assignee_ids": (string)[],"p_description"?: string,"p_due_at"?: string,"p_estimated_hours"?: number,"p_is_private"?: boolean,"p_is_urgent"?: boolean,"p_item_id": string,"p_primary_ids"?: (string)[],"p_priority"?: Database["public"]['Enums']["task_priority"],"p_size"?: Database["public"]['Enums']["task_size"],"p_title"?: string }; Returns: string
                           },
"can_review_task":
{ Args: { "p_task_id": string }; Returns: boolean
                           },
"chat_feed":
{ Args: { "p_limit"?: number }; Returns: {
              "body": string,"created_at": string,"expires_at": string,"id": string,"is_anonymous": boolean,"is_mine": boolean,"kind": Database["public"]['Enums']["chat_kind"],"media_path": string,"mentions_me": boolean,"my_reactions": (string)[],"reactions": Json,"sender_id": string,"sender_name": string,"sticker": string
            }[]
                           },
"create_meeting":
{ Args: { "p_action_items"?: (string)[],"p_attendee_ids"?: (string)[],"p_ends_at": string,"p_proxy_ids"?: (string)[],"p_starts_at": string,"p_summary"?: string,"p_team_id": string,"p_title": string }; Returns: string
                           },
"create_task":
{ Args: { "p_assignee_ids"?: (string)[],"p_category_id"?: string,"p_description"?: string,"p_due_at"?: string,"p_estimated_hours"?: number,"p_is_private"?: boolean,"p_is_urgent"?: boolean,"p_parent_task_id"?: string,"p_primary_ids"?: (string)[],"p_priority"?: Database["public"]['Enums']["task_priority"],"p_project_id"?: string,"p_size"?: Database["public"]['Enums']["task_size"],"p_team_id": string,"p_title": string }; Returns: string
                           },
"decide_due_change":
{ Args: { "p_approve": boolean,"p_note"?: string,"p_request_id": string }; Returns: undefined
                           },
"dismiss_action_item":
{ Args: { "p_item_id": string }; Returns: undefined
                           },
"is_task_reviewer":
{ Args: { "p_task_id": string }; Returns: boolean
                           },
"log_export":
{ Args: { "p_filters"?: Json,"p_format": string,"p_kind": string,"p_rows": number }; Returns: undefined
                           },
"mark_notifications_read":
{ Args: { "p_ids"?: (string)[] }; Returns: number
                           },
"react_chat_message":
{ Args: { "p_emoji": string,"p_message_id": string,"p_on"?: boolean }; Returns: undefined
                           },
"remove_checklist_item":
{ Args: { "p_item_id": string }; Returns: undefined
                           },
"report_tasks":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "approved_submitted_at": string,"archived_at": string,"assignee_ids": (string)[],"category_id": string,"completed_at": string,"created_at": string,"due_at": string,"estimated_hours": number,"id": string,"is_private": boolean,"is_urgent": boolean,"priority": Database["public"]['Enums']["task_priority"],"size": Database["public"]['Enums']["task_size"],"status": Database["public"]['Enums']["task_status"],"team_id": string
            }[]
                           },
"request_due_change":
{ Args: { "p_proposed_due_at": string,"p_reason": string,"p_task_id": string }; Returns: string
                           },
"review_task":
{ Args: { "p_comment"?: string,"p_decision": Database["public"]['Enums']["review_decision"],"p_task_id": string }; Returns: undefined
                           },
"run_chat_purge":
{ Args: { "p_now"?: string }; Returns: number
                           },
"run_due_reminders":
{ Args: { "p_now"?: string }; Returns: number
                           },
"run_recurrences":
{ Args: { "p_now"?: string }; Returns: number
                           },
"run_unassigned_meeting_reminders":
{ Args: { "p_now"?: string }; Returns: number
                           },
"search_tasks":
{ Args: { "p_assignee_id"?: string,"p_category_id"?: string,"p_include_archived"?: boolean,"p_priority"?: Database["public"]['Enums']["task_priority"],"p_query"?: string,"p_statuses"?: (Database["public"]['Enums']["task_status"])[],"p_tag_id"?: string,"p_urgent_only"?: boolean }; Returns: {
              "archived_at": string,"assignee_absent_today": boolean,"assignee_ids": (string)[],"category_id": string,"created_at": string,"created_by": string,"due_at": string,"estimated_hours": number,"has_pending_extension": boolean,"id": string,"is_new_today": boolean,"is_private": boolean,"is_recurring": boolean,"is_urgent": boolean,"priority": Database["public"]['Enums']["task_priority"],"redacted": boolean,"size": Database["public"]['Enums']["task_size"],"status": Database["public"]['Enums']["task_status"],"tag_ids": (string)[],"team_id": string,"title": string
            }[]
                           },
"send_chat_message":
{ Args: { "p_anonymous"?: boolean,"p_body"?: string,"p_kind": Database["public"]['Enums']["chat_kind"],"p_media_path"?: string,"p_mentions"?: (string)[],"p_sticker"?: string }; Returns: string
                           },
"set_checklist_item_done":
{ Args: { "p_done": boolean,"p_item_id": string }; Returns: undefined
                           },
"set_task_category":
{ Args: { "p_category_id": string,"p_task_id": string }; Returns: undefined
                           },
"set_task_recurrence":
{ Args: { "p_day_of_month"?: number,"p_due_time"?: string,"p_freq": Database["public"]['Enums']["recurrence_freq"],"p_interval"?: number,"p_task_id": string,"p_until"?: string,"p_weekdays"?: (number)[] }; Returns: string
                           },
"set_task_tags":
{ Args: { "p_tag_ids": (string)[],"p_task_id": string }; Returns: undefined
                           },
"stop_task_recurrence":
{ Args: { "p_task_id": string }; Returns: undefined
                           },
"submit_task":
{ Args: { "p_attachments"?: Json,"p_note"?: string,"p_task_id": string }; Returns: string
                           },
"suggest_assignees":
{ Args: { "p_due_at"?: string,"p_estimated_hours"?: number,"p_size"?: Database["public"]['Enums']["task_size"],"p_skill_id"?: string,"p_team_id": string }; Returns: {
              "available_hours": number,"components": Json,"free_hours": number,"needed_hours": number,"on_leave_at_due": boolean,"open_hours": number,"open_tasks": number,"score": number,"skill_level": number,"user_id": string
            }[]
                           },
"task_directory":
{ Args: { "p_team_id"?: string }; Returns: {
              "archived_at": string,"assignee_absent_today": boolean,"assignee_ids": (string)[],"category_id": string,"created_at": string,"created_by": string,"due_at": string,"estimated_hours": number,"has_pending_extension": boolean,"id": string,"is_new_today": boolean,"is_private": boolean,"is_recurring": boolean,"is_urgent": boolean,"priority": Database["public"]['Enums']["task_priority"],"redacted": boolean,"size": Database["public"]['Enums']["task_size"],"status": Database["public"]['Enums']["task_status"],"tag_ids": (string)[],"team_id": string,"title": string
            }[]
                           },
"update_task_details":
{ Args: { "p_clear_due"?: boolean,"p_due_at"?: string,"p_estimated_hours"?: number,"p_priority"?: Database["public"]['Enums']["task_priority"],"p_reminder_days"?: number,"p_size"?: Database["public"]['Enums']["task_size"],"p_task_id": string }; Returns: undefined
                           },
"update_task_status":
{ Args: { "p_note"?: string,"p_status": Database["public"]['Enums']["task_status"],"p_task_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "absence_part": "full_day"|"am"|"pm","action_item_status": "unassigned"|"assigned"|"dismissed","app_role": "director"|"manager"|"member"|"admin","change_request_status": "pending"|"approved"|"rejected","chat_kind": "text"|"sticker"|"image","office_status_kind": "working"|"focus"|"break"|"offsite","pet_species": "dog"|"cat","recurrence_freq": "daily"|"weekly"|"monthly"|"yearly"|"custom","review_decision": "approved"|"revision_required","review_level": "manager"|"director","task_priority": "low"|"medium"|"high","task_size": "xs"|"s"|"m"|"l"|"xl","task_status": "not_started"|"in_progress"|"blocked"|"in_review"|"revision_required"|"completed"|"paused"|"cancelled"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "absence_part": ["full_day", "am", "pm"],"action_item_status": ["unassigned", "assigned", "dismissed"],"app_role": ["director", "manager", "member", "admin"],"change_request_status": ["pending", "approved", "rejected"],"chat_kind": ["text", "sticker", "image"],"office_status_kind": ["working", "focus", "break", "offsite"],"pet_species": ["dog", "cat"],"recurrence_freq": ["daily", "weekly", "monthly", "yearly", "custom"],"review_decision": ["approved", "revision_required"],"review_level": ["manager", "director"],"task_priority": ["low", "medium", "high"],"task_size": ["xs", "s", "m", "l", "xl"],"task_status": ["not_started", "in_progress", "blocked", "in_review", "revision_required", "completed", "paused", "cancelled"]
          }
        }
} as const
