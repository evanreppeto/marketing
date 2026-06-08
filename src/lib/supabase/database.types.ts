/**
 * Supabase Database types — Signal growth engine (public schema).
 *
 * Derived from the SQL migrations in `supabase/migrations/` (the applied source
 * of truth). Shaped exactly like `supabase gen types typescript` output so it
 * can be drop-in regenerated once a Supabase access token / CLI is available:
 *
 *   supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts
 *
 * Scope: the tables consumed by the read-models, persistence, and server
 * actions. Add tables here as more of the schema gets wired into the app.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string;
          name: string;
          persona: Database["public"]["Enums"]["persona_mapping"];
          status: Database["public"]["Enums"]["company_status"];
          website_url: string | null;
          phone: string | null;
          email: string | null;
          partner_tier: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          persona?: Database["public"]["Enums"]["persona_mapping"];
          status?: Database["public"]["Enums"]["company_status"];
          website_url?: string | null;
          phone?: string | null;
          email?: string | null;
          partner_tier?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          persona?: Database["public"]["Enums"]["persona_mapping"];
          status?: Database["public"]["Enums"]["company_status"];
          website_url?: string | null;
          phone?: string | null;
          email?: string | null;
          partner_tier?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      contacts: {
        Row: {
          id: string;
          company_id: string | null;
          persona: Database["public"]["Enums"]["persona_mapping"];
          status: Database["public"]["Enums"]["contact_status"];
          first_name: string | null;
          last_name: string | null;
          full_name: string | null;
          email: string | null;
          phone: string | null;
          title: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id?: string | null;
          persona?: Database["public"]["Enums"]["persona_mapping"];
          status?: Database["public"]["Enums"]["contact_status"];
          first_name?: string | null;
          last_name?: string | null;
          full_name?: string | null;
          email?: string | null;
          phone?: string | null;
          title?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string | null;
          persona?: Database["public"]["Enums"]["persona_mapping"];
          status?: Database["public"]["Enums"]["contact_status"];
          first_name?: string | null;
          last_name?: string | null;
          full_name?: string | null;
          email?: string | null;
          phone?: string | null;
          title?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      properties: {
        Row: {
          id: string;
          company_id: string | null;
          contact_id: string | null;
          persona: Database["public"]["Enums"]["persona_mapping"];
          street_line_1: string;
          street_line_2: string | null;
          city: string;
          state: string;
          postal_code: string;
          property_type: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id?: string | null;
          contact_id?: string | null;
          persona?: Database["public"]["Enums"]["persona_mapping"];
          street_line_1: string;
          street_line_2?: string | null;
          city: string;
          state: string;
          postal_code: string;
          property_type?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string | null;
          contact_id?: string | null;
          persona?: Database["public"]["Enums"]["persona_mapping"];
          street_line_1?: string;
          street_line_2?: string | null;
          city?: string;
          state?: string;
          postal_code?: string;
          property_type?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          company_id: string | null;
          contact_id: string | null;
          property_id: string | null;
          persona: Database["public"]["Enums"]["persona_mapping"];
          status: Database["public"]["Enums"]["lead_status"];
          routing_recommendation: Database["public"]["Enums"]["routing_recommendation"];
          source: string;
          external_lead_id: string | null;
          loss_summary: string | null;
          loss_signals: string[];
          matched_target_keywords: string[];
          matched_non_target_keywords: string[];
          lead_score: number;
          received_at: string;
          metadata: Json;
          created_at: string;
          updated_at: string;
          attributed_campaign_id: string | null;
          attributed_asset_id: string | null;
          attribution_channel: string | null;
          attribution_method: string | null;
          attribution_utm: Json;
        };
        Insert: {
          id?: string;
          company_id?: string | null;
          contact_id?: string | null;
          property_id?: string | null;
          persona: Database["public"]["Enums"]["persona_mapping"];
          status?: Database["public"]["Enums"]["lead_status"];
          routing_recommendation?: Database["public"]["Enums"]["routing_recommendation"];
          source: string;
          external_lead_id?: string | null;
          loss_summary?: string | null;
          loss_signals?: string[];
          matched_target_keywords?: string[];
          matched_non_target_keywords?: string[];
          lead_score?: number;
          received_at?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
          attributed_campaign_id?: string | null;
          attributed_asset_id?: string | null;
          attribution_channel?: string | null;
          attribution_method?: string | null;
          attribution_utm?: Json;
        };
        Update: {
          id?: string;
          company_id?: string | null;
          contact_id?: string | null;
          property_id?: string | null;
          persona?: Database["public"]["Enums"]["persona_mapping"];
          status?: Database["public"]["Enums"]["lead_status"];
          routing_recommendation?: Database["public"]["Enums"]["routing_recommendation"];
          source?: string;
          external_lead_id?: string | null;
          loss_summary?: string | null;
          loss_signals?: string[];
          matched_target_keywords?: string[];
          matched_non_target_keywords?: string[];
          lead_score?: number;
          received_at?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
          attributed_campaign_id?: string | null;
          attributed_asset_id?: string | null;
          attribution_channel?: string | null;
          attribution_method?: string | null;
          attribution_utm?: Json;
        };
        Relationships: [];
      };
      jobs: {
        Row: {
          id: string;
          lead_id: string | null;
          company_id: string | null;
          contact_id: string | null;
          property_id: string | null;
          persona: Database["public"]["Enums"]["persona_mapping"];
          status: Database["public"]["Enums"]["job_status"];
          job_number: string | null;
          scheduled_at: string | null;
          completed_at: string | null;
          estimated_revenue_cents: number | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lead_id?: string | null;
          company_id?: string | null;
          contact_id?: string | null;
          property_id?: string | null;
          persona?: Database["public"]["Enums"]["persona_mapping"];
          status?: Database["public"]["Enums"]["job_status"];
          job_number?: string | null;
          scheduled_at?: string | null;
          completed_at?: string | null;
          estimated_revenue_cents?: number | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          lead_id?: string | null;
          company_id?: string | null;
          contact_id?: string | null;
          property_id?: string | null;
          persona?: Database["public"]["Enums"]["persona_mapping"];
          status?: Database["public"]["Enums"]["job_status"];
          job_number?: string | null;
          scheduled_at?: string | null;
          completed_at?: string | null;
          estimated_revenue_cents?: number | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      outcomes: {
        Row: {
          id: string;
          job_id: string | null;
          lead_id: string | null;
          company_id: string | null;
          contact_id: string | null;
          property_id: string | null;
          persona: Database["public"]["Enums"]["persona_mapping"];
          status: Database["public"]["Enums"]["outcome_status"];
          gross_revenue_cents: number | null;
          gross_margin_cents: number | null;
          closed_at: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          job_id?: string | null;
          lead_id?: string | null;
          company_id?: string | null;
          contact_id?: string | null;
          property_id?: string | null;
          persona?: Database["public"]["Enums"]["persona_mapping"];
          status?: Database["public"]["Enums"]["outcome_status"];
          gross_revenue_cents?: number | null;
          gross_margin_cents?: number | null;
          closed_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string | null;
          lead_id?: string | null;
          company_id?: string | null;
          contact_id?: string | null;
          property_id?: string | null;
          persona?: Database["public"]["Enums"]["persona_mapping"];
          status?: Database["public"]["Enums"]["outcome_status"];
          gross_revenue_cents?: number | null;
          gross_margin_cents?: number | null;
          closed_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          actor: string;
          subject_type: Database["public"]["Enums"]["event_subject_type"];
          subject_id: string;
          type: string;
          payload: Json;
          occurred_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor: string;
          subject_type: Database["public"]["Enums"]["event_subject_type"];
          subject_id: string;
          type: string;
          payload?: Json;
          occurred_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor?: string;
          subject_type?: Database["public"]["Enums"]["event_subject_type"];
          subject_id?: string;
          type?: string;
          payload?: Json;
          occurred_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      routing_decisions: {
        Row: {
          id: string;
          lead_id: string;
          decision: Database["public"]["Enums"]["routing_decision_kind"];
          confidence: number;
          sla_target_minutes: number | null;
          decided_by: string;
          decided_at: string;
          rationale: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          decision: Database["public"]["Enums"]["routing_decision_kind"];
          confidence: number;
          sla_target_minutes?: number | null;
          decided_by: string;
          decided_at?: string;
          rationale?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          lead_id?: string;
          decision?: Database["public"]["Enums"]["routing_decision_kind"];
          confidence?: number;
          sla_target_minutes?: number | null;
          decided_by?: string;
          decided_at?: string;
          rationale?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      integrity_findings: {
        Row: {
          id: string;
          rule_key: string;
          subject_type: Database["public"]["Enums"]["event_subject_type"];
          subject_id: string;
          severity: Database["public"]["Enums"]["integrity_severity"];
          detail: Json;
          detected_at: string;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          rule_key: string;
          subject_type: Database["public"]["Enums"]["event_subject_type"];
          subject_id: string;
          severity?: Database["public"]["Enums"]["integrity_severity"];
          detail?: Json;
          detected_at?: string;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          rule_key?: string;
          subject_type?: Database["public"]["Enums"]["event_subject_type"];
          subject_id?: string;
          severity?: Database["public"]["Enums"]["integrity_severity"];
          detail?: Json;
          detected_at?: string;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      campaigns: {
        Row: {
          id: string;
          name: string;
          persona: Database["public"]["Enums"]["persona_mapping"];
          restoration_focus: Database["public"]["Enums"]["restoration_focus"];
          status: Database["public"]["Enums"]["campaign_status"];
          company_id: string | null;
          contact_id: string | null;
          property_id: string | null;
          lead_id: string | null;
          owner: string | null;
          objective: string | null;
          audience_summary: string | null;
          offer_summary: string | null;
          compliance_notes: string | null;
          source_system: string | null;
          external_campaign_id: string | null;
          launch_locked: boolean;
          source_signal: Json;
          reasoning_payload: Json;
          audit_payload: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          persona: Database["public"]["Enums"]["persona_mapping"];
          restoration_focus: Database["public"]["Enums"]["restoration_focus"];
          status?: Database["public"]["Enums"]["campaign_status"];
          company_id?: string | null;
          contact_id?: string | null;
          property_id?: string | null;
          lead_id?: string | null;
          owner?: string | null;
          objective?: string | null;
          audience_summary?: string | null;
          offer_summary?: string | null;
          compliance_notes?: string | null;
          source_system?: string | null;
          external_campaign_id?: string | null;
          launch_locked?: boolean;
          source_signal?: Json;
          reasoning_payload?: Json;
          audit_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          persona?: Database["public"]["Enums"]["persona_mapping"];
          restoration_focus?: Database["public"]["Enums"]["restoration_focus"];
          status?: Database["public"]["Enums"]["campaign_status"];
          company_id?: string | null;
          contact_id?: string | null;
          property_id?: string | null;
          lead_id?: string | null;
          owner?: string | null;
          objective?: string | null;
          audience_summary?: string | null;
          offer_summary?: string | null;
          compliance_notes?: string | null;
          source_system?: string | null;
          external_campaign_id?: string | null;
          launch_locked?: boolean;
          source_signal?: Json;
          reasoning_payload?: Json;
          audit_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      campaign_assets: {
        Row: {
          id: string;
          campaign_id: string;
          asset_type: Database["public"]["Enums"]["campaign_asset_type"];
          channel: string | null;
          title: string;
          status: Database["public"]["Enums"]["approval_status"];
          source_system: string | null;
          external_asset_id: string | null;
          tool_source: string | null;
          prompt_input: string | null;
          prompt_inputs: Json;
          draft_body: string | null;
          edited_body: string | null;
          approved_body: string | null;
          approved_by: string | null;
          approved_at: string | null;
          dispatch_locked: boolean;
          compliance_notes: string | null;
          reasoning_payload: Json;
          audit_payload: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          asset_type: Database["public"]["Enums"]["campaign_asset_type"];
          channel?: string | null;
          title: string;
          status?: Database["public"]["Enums"]["approval_status"];
          source_system?: string | null;
          external_asset_id?: string | null;
          tool_source?: string | null;
          prompt_input?: string | null;
          prompt_inputs?: Json;
          draft_body?: string | null;
          edited_body?: string | null;
          approved_body?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          dispatch_locked?: boolean;
          compliance_notes?: string | null;
          reasoning_payload?: Json;
          audit_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          asset_type?: Database["public"]["Enums"]["campaign_asset_type"];
          channel?: string | null;
          title?: string;
          status?: Database["public"]["Enums"]["approval_status"];
          source_system?: string | null;
          external_asset_id?: string | null;
          tool_source?: string | null;
          prompt_input?: string | null;
          prompt_inputs?: Json;
          draft_body?: string | null;
          edited_body?: string | null;
          approved_body?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          dispatch_locked?: boolean;
          compliance_notes?: string | null;
          reasoning_payload?: Json;
          audit_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      approval_items: {
        Row: {
          id: string;
          campaign_id: string | null;
          campaign_asset_id: string | null;
          company_id: string | null;
          contact_id: string | null;
          property_id: string | null;
          lead_id: string | null;
          item_type: string;
          status: Database["public"]["Enums"]["approval_status"];
          approval_required: boolean;
          locked_until_approved: boolean;
          prompt_inputs: Json;
          draft_output: string | null;
          edited_output: string | null;
          requested_by: string | null;
          submitted_at: string;
          reviewed_by: string | null;
          reviewed_at: string | null;
          risk_level: string;
          compliance_notes: string | null;
          decision_notes: string | null;
          reasoning_payload: Json;
          audit_payload: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_id?: string | null;
          campaign_asset_id?: string | null;
          company_id?: string | null;
          contact_id?: string | null;
          property_id?: string | null;
          lead_id?: string | null;
          item_type: string;
          status?: Database["public"]["Enums"]["approval_status"];
          approval_required?: boolean;
          locked_until_approved?: boolean;
          prompt_inputs?: Json;
          draft_output?: string | null;
          edited_output?: string | null;
          requested_by?: string | null;
          submitted_at?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          risk_level?: string;
          compliance_notes?: string | null;
          decision_notes?: string | null;
          reasoning_payload?: Json;
          audit_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string | null;
          campaign_asset_id?: string | null;
          company_id?: string | null;
          contact_id?: string | null;
          property_id?: string | null;
          lead_id?: string | null;
          item_type?: string;
          status?: Database["public"]["Enums"]["approval_status"];
          approval_required?: boolean;
          locked_until_approved?: boolean;
          prompt_inputs?: Json;
          draft_output?: string | null;
          edited_output?: string | null;
          requested_by?: string | null;
          submitted_at?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          risk_level?: string;
          compliance_notes?: string | null;
          decision_notes?: string | null;
          reasoning_payload?: Json;
          audit_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      approval_decisions: {
        Row: {
          id: string;
          approval_item_id: string;
          decision: Database["public"]["Enums"]["approval_decision_kind"];
          decided_by: string;
          decided_at: string;
          decision_notes: string | null;
          previous_status: Database["public"]["Enums"]["approval_status"] | null;
          next_status: Database["public"]["Enums"]["approval_status"];
          edited_output: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          approval_item_id: string;
          decision: Database["public"]["Enums"]["approval_decision_kind"];
          decided_by: string;
          decided_at?: string;
          decision_notes?: string | null;
          previous_status?: Database["public"]["Enums"]["approval_status"] | null;
          next_status: Database["public"]["Enums"]["approval_status"];
          edited_output?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          approval_item_id?: string;
          decision?: Database["public"]["Enums"]["approval_decision_kind"];
          decided_by?: string;
          decided_at?: string;
          decision_notes?: string | null;
          previous_status?: Database["public"]["Enums"]["approval_status"] | null;
          next_status?: Database["public"]["Enums"]["approval_status"];
          edited_output?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      campaign_events: {
        Row: {
          id: string;
          campaign_id: string;
          campaign_asset_id: string | null;
          approval_item_id: string | null;
          event_type: Database["public"]["Enums"]["campaign_event_type"];
          actor: string | null;
          detail: string | null;
          payload: Json;
          occurred_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          campaign_asset_id?: string | null;
          approval_item_id?: string | null;
          event_type: Database["public"]["Enums"]["campaign_event_type"];
          actor?: string | null;
          detail?: string | null;
          payload?: Json;
          occurred_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          campaign_asset_id?: string | null;
          approval_item_id?: string | null;
          event_type?: Database["public"]["Enums"]["campaign_event_type"];
          actor?: string | null;
          detail?: string | null;
          payload?: Json;
          occurred_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      persona_snapshots: {
        Row: {
          id: string;
          persona: Database["public"]["Enums"]["persona_mapping"];
          company_id: string | null;
          contact_id: string | null;
          property_id: string | null;
          lead_id: string | null;
          job_id: string | null;
          outcome_id: string | null;
          campaign_id: string | null;
          is_current: boolean;
          snapshot_version: number;
          hyper_persona_summary: string | null;
          relationship_stage: string | null;
          value_tier: string | null;
          dominant_loss_pattern: string | null;
          preferred_channel: string | null;
          message_posture: string | null;
          recommended_offer: string | null;
          next_best_action: string | null;
          confidence_score: number | null;
          risk_flags: string[];
          situation_context: Json;
          relationship_context: Json;
          behavior_context: Json;
          value_context: Json;
          channel_context: Json;
          message_context: Json;
          capacity_context: Json;
          source_events: Json;
          source_hash: string | null;
          reasoning_payload: Json;
          audit_payload: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          persona: Database["public"]["Enums"]["persona_mapping"];
          company_id?: string | null;
          contact_id?: string | null;
          property_id?: string | null;
          lead_id?: string | null;
          job_id?: string | null;
          outcome_id?: string | null;
          campaign_id?: string | null;
          is_current?: boolean;
          snapshot_version?: number;
          hyper_persona_summary?: string | null;
          relationship_stage?: string | null;
          value_tier?: string | null;
          dominant_loss_pattern?: string | null;
          preferred_channel?: string | null;
          message_posture?: string | null;
          recommended_offer?: string | null;
          next_best_action?: string | null;
          confidence_score?: number | null;
          risk_flags?: string[];
          situation_context?: Json;
          relationship_context?: Json;
          behavior_context?: Json;
          value_context?: Json;
          channel_context?: Json;
          message_context?: Json;
          capacity_context?: Json;
          source_events?: Json;
          source_hash?: string | null;
          reasoning_payload?: Json;
          audit_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          persona?: Database["public"]["Enums"]["persona_mapping"];
          company_id?: string | null;
          contact_id?: string | null;
          property_id?: string | null;
          lead_id?: string | null;
          job_id?: string | null;
          outcome_id?: string | null;
          campaign_id?: string | null;
          is_current?: boolean;
          snapshot_version?: number;
          hyper_persona_summary?: string | null;
          relationship_stage?: string | null;
          value_tier?: string | null;
          dominant_loss_pattern?: string | null;
          preferred_channel?: string | null;
          message_posture?: string | null;
          recommended_offer?: string | null;
          next_best_action?: string | null;
          confidence_score?: number | null;
          risk_flags?: string[];
          situation_context?: Json;
          relationship_context?: Json;
          behavior_context?: Json;
          value_context?: Json;
          channel_context?: Json;
          message_context?: Json;
          capacity_context?: Json;
          source_events?: Json;
          source_hash?: string | null;
          reasoning_payload?: Json;
          audit_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      engagement_events: {
        Row: {
          id: string;
          company_id: string | null;
          contact_id: string | null;
          property_id: string | null;
          lead_id: string | null;
          job_id: string | null;
          outcome_id: string | null;
          campaign_id: string | null;
          campaign_asset_id: string | null;
          event_type: string;
          channel: string | null;
          source_system: string | null;
          external_event_id: string | null;
          occurred_at: string;
          summary: string | null;
          direction: string | null;
          metadata: Json;
          reasoning_payload: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id?: string | null;
          contact_id?: string | null;
          property_id?: string | null;
          lead_id?: string | null;
          job_id?: string | null;
          outcome_id?: string | null;
          campaign_id?: string | null;
          campaign_asset_id?: string | null;
          event_type: string;
          channel?: string | null;
          source_system?: string | null;
          external_event_id?: string | null;
          occurred_at?: string;
          summary?: string | null;
          direction?: string | null;
          metadata?: Json;
          reasoning_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string | null;
          contact_id?: string | null;
          property_id?: string | null;
          lead_id?: string | null;
          job_id?: string | null;
          outcome_id?: string | null;
          campaign_id?: string | null;
          campaign_asset_id?: string | null;
          event_type?: string;
          channel?: string | null;
          source_system?: string | null;
          external_event_id?: string | null;
          occurred_at?: string;
          summary?: string | null;
          direction?: string | null;
          metadata?: Json;
          reasoning_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      next_best_actions: {
        Row: {
          id: string;
          persona_snapshot_id: string | null;
          approval_item_id: string | null;
          campaign_id: string | null;
          company_id: string | null;
          contact_id: string | null;
          property_id: string | null;
          lead_id: string | null;
          title: string;
          action_type: string;
          status: Database["public"]["Enums"]["next_best_action_status"];
          priority: number;
          approval_required: boolean;
          recommendation: string | null;
          reason: string | null;
          due_at: string | null;
          reasoning_payload: Json;
          audit_payload: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          persona_snapshot_id?: string | null;
          approval_item_id?: string | null;
          campaign_id?: string | null;
          company_id?: string | null;
          contact_id?: string | null;
          property_id?: string | null;
          lead_id?: string | null;
          title: string;
          action_type: string;
          status?: Database["public"]["Enums"]["next_best_action_status"];
          priority?: number;
          approval_required?: boolean;
          recommendation?: string | null;
          reason?: string | null;
          due_at?: string | null;
          reasoning_payload?: Json;
          audit_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          persona_snapshot_id?: string | null;
          approval_item_id?: string | null;
          campaign_id?: string | null;
          company_id?: string | null;
          contact_id?: string | null;
          property_id?: string | null;
          lead_id?: string | null;
          title?: string;
          action_type?: string;
          status?: Database["public"]["Enums"]["next_best_action_status"];
          priority?: number;
          approval_required?: boolean;
          recommendation?: string | null;
          reason?: string | null;
          due_at?: string | null;
          reasoning_payload?: Json;
          audit_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agents: {
        Row: {
          id: string;
          key: string;
          name: string;
          description: string | null;
          status: Database["public"]["Enums"]["agent_status"];
          allowed_actions: string[];
          blocked_actions: string[];
          default_approval_policy: string;
          system_instructions: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          name: string;
          description?: string | null;
          status?: Database["public"]["Enums"]["agent_status"];
          allowed_actions?: string[];
          blocked_actions?: string[];
          default_approval_policy?: string;
          system_instructions?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          name?: string;
          description?: string | null;
          status?: Database["public"]["Enums"]["agent_status"];
          allowed_actions?: string[];
          blocked_actions?: string[];
          default_approval_policy?: string;
          system_instructions?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agent_tasks: {
        Row: {
          id: string;
          agent_id: string;
          status: Database["public"]["Enums"]["agent_task_status"];
          priority: Database["public"]["Enums"]["agent_task_priority"];
          objective: string;
          task_type: string;
          source_type: string | null;
          source_id: string | null;
          campaign_id: string | null;
          persona_snapshot_id: string | null;
          approval_item_id: string | null;
          due_at: string | null;
          started_at: string | null;
          completed_at: string | null;
          retry_count: number;
          max_retries: number;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          status?: Database["public"]["Enums"]["agent_task_status"];
          priority?: Database["public"]["Enums"]["agent_task_priority"];
          objective: string;
          task_type: string;
          source_type?: string | null;
          source_id?: string | null;
          campaign_id?: string | null;
          persona_snapshot_id?: string | null;
          approval_item_id?: string | null;
          due_at?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          retry_count?: number;
          max_retries?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          agent_id?: string;
          status?: Database["public"]["Enums"]["agent_task_status"];
          priority?: Database["public"]["Enums"]["agent_task_priority"];
          objective?: string;
          task_type?: string;
          source_type?: string | null;
          source_id?: string | null;
          campaign_id?: string | null;
          persona_snapshot_id?: string | null;
          approval_item_id?: string | null;
          due_at?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          retry_count?: number;
          max_retries?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agent_task_inputs: {
        Row: {
          id: string;
          task_id: string;
          input_type: string;
          source_table: string | null;
          source_id: string | null;
          summary: string | null;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          input_type: string;
          source_table?: string | null;
          source_id?: string | null;
          summary?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          input_type?: string;
          source_table?: string | null;
          source_id?: string | null;
          summary?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      agent_outputs: {
        Row: {
          id: string;
          task_id: string;
          approval_item_id: string | null;
          campaign_asset_id: string | null;
          output_type: string;
          title: string;
          body: string | null;
          edited_body: string | null;
          structured_payload: Json;
          risk_level: Database["public"]["Enums"]["agent_risk_level"];
          compliance_status: Database["public"]["Enums"]["approval_status"];
          approval_status: Database["public"]["Enums"]["approval_status"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          approval_item_id?: string | null;
          campaign_asset_id?: string | null;
          output_type: string;
          title: string;
          body?: string | null;
          edited_body?: string | null;
          structured_payload?: Json;
          risk_level?: Database["public"]["Enums"]["agent_risk_level"];
          compliance_status?: Database["public"]["Enums"]["approval_status"];
          approval_status?: Database["public"]["Enums"]["approval_status"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          approval_item_id?: string | null;
          campaign_asset_id?: string | null;
          output_type?: string;
          title?: string;
          body?: string | null;
          edited_body?: string | null;
          structured_payload?: Json;
          risk_level?: Database["public"]["Enums"]["agent_risk_level"];
          compliance_status?: Database["public"]["Enums"]["approval_status"];
          approval_status?: Database["public"]["Enums"]["approval_status"];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agent_run_logs: {
        Row: {
          id: string;
          task_id: string | null;
          agent_id: string;
          run_status: Database["public"]["Enums"]["agent_run_status"];
          model_provider: string | null;
          model_name: string | null;
          input_token_count: number | null;
          output_token_count: number | null;
          cost_estimate_cents: number | null;
          reasoning_summary: string | null;
          error_message: string | null;
          started_at: string | null;
          completed_at: string | null;
          retry_count: number;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id?: string | null;
          agent_id: string;
          run_status?: Database["public"]["Enums"]["agent_run_status"];
          model_provider?: string | null;
          model_name?: string | null;
          input_token_count?: number | null;
          output_token_count?: number | null;
          cost_estimate_cents?: number | null;
          reasoning_summary?: string | null;
          error_message?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          retry_count?: number;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string | null;
          agent_id?: string;
          run_status?: Database["public"]["Enums"]["agent_run_status"];
          model_provider?: string | null;
          model_name?: string | null;
          input_token_count?: number | null;
          output_token_count?: number | null;
          cost_estimate_cents?: number | null;
          reasoning_summary?: string | null;
          error_message?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          retry_count?: number;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      persona_knowledge_entries: {
        Row: {
          id: string;
          persona: Database["public"]["Enums"]["persona_mapping"];
          section_key: string;
          entry_type: string;
          title: string;
          body: string;
          priority: number;
          status: string;
          source_reference: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          persona: Database["public"]["Enums"]["persona_mapping"];
          section_key: string;
          entry_type: string;
          title: string;
          body: string;
          priority?: number;
          status?: string;
          source_reference?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          persona?: Database["public"]["Enums"]["persona_mapping"];
          section_key?: string;
          entry_type?: string;
          title?: string;
          body?: string;
          priority?: number;
          status?: string;
          source_reference?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      guardrail_rules: {
        Row: {
          id: string;
          rule_key: string;
          scope: Database["public"]["Enums"]["guardrail_scope"];
          severity: Database["public"]["Enums"]["guardrail_severity"];
          status: string;
          pattern: string | null;
          matcher_payload: Json;
          failure_message: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          rule_key: string;
          scope: Database["public"]["Enums"]["guardrail_scope"];
          severity?: Database["public"]["Enums"]["guardrail_severity"];
          status?: string;
          pattern?: string | null;
          matcher_payload?: Json;
          failure_message: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          rule_key?: string;
          scope?: Database["public"]["Enums"]["guardrail_scope"];
          severity?: Database["public"]["Enums"]["guardrail_severity"];
          status?: string;
          pattern?: string | null;
          matcher_payload?: Json;
          failure_message?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      persona_mapping:
        | "persona_homeowner_emergency"
        | "persona_homeowner_preventative"
        | "persona_homeowner_rebuild"
        | "persona_landlord"
        | "persona_hoa_board"
        | "persona_property_manager"
        | "persona_insurance_agent"
        | "persona_listing_agent"
        | "persona_buyers_agent"
        | "persona_plumbing_partner"
        | "persona_hvac_roof_electrical_partner"
        | "persona_gc_remodeler_partner"
        | "unassigned_persona";
      company_status: "active" | "inactive" | "archived";
      contact_status: "active" | "inactive" | "do_not_contact" | "archived";
      lead_status: "new" | "validated" | "needs_review" | "qualified" | "converted" | "lost" | "archived";
      routing_recommendation: "target" | "elevated" | "downgraded" | "isolated" | "archived";
      job_status: "pending" | "scheduled" | "in_progress" | "completed" | "canceled";
      outcome_status: "pending" | "won" | "lost" | "paid" | "written_off";
      event_subject_type: "company" | "contact" | "property" | "lead" | "job" | "outcome";
      routing_decision_kind: "mitigation" | "review" | "out_of_scope" | "archived";
      integrity_severity: "info" | "warning" | "blocking";
      restoration_focus:
        | "flood"
        | "water_backup"
        | "burst_pipe"
        | "storm_surge"
        | "standing_water"
        | "mold"
        | "sewage"
        | "fire";
      campaign_status:
        | "draft"
        | "briefing"
        | "generating"
        | "pending_approval"
        | "approved"
        | "active"
        | "paused"
        | "archived"
        | "blocked";
      campaign_asset_type:
        | "landing_page"
        | "search_ad"
        | "social_ad"
        | "display_ad"
        | "google_business_post"
        | "email"
        | "sms"
        | "video_prompt"
        | "image_prompt"
        | "one_pager"
        | "referral_packet"
        | "review_response"
        | "script"
        | "other";
      approval_status:
        | "draft"
        | "needs_compliance"
        | "pending_approval"
        | "pending_owner_approval"
        | "approved"
        | "declined"
        | "rejected"
        | "revision_requested"
        | "blocked"
        | "needs_revision"
        | "archived";
      approval_decision_kind: "approved" | "declined" | "revision_requested" | "archived" | "blocked";
      campaign_event_type:
        | "created"
        | "brief_created"
        | "asset_generated"
        | "approval_submitted"
        | "approval_decided"
        | "exported"
        | "launched"
        | "paused"
        | "archived"
        | "result_recorded";
      next_best_action_status: "open" | "accepted" | "snoozed" | "completed" | "dismissed";
      agent_status: "draft" | "ready" | "running" | "paused" | "blocked" | "disabled";
      agent_task_status: "queued" | "running" | "blocked" | "needs_approval" | "completed" | "failed" | "canceled";
      agent_task_priority: "low" | "medium" | "high" | "urgent";
      agent_risk_level: "low" | "medium" | "high" | "blocked";
      agent_run_status: "queued" | "running" | "completed" | "failed" | "canceled";
      guardrail_scope:
        | "prompt_input"
        | "generated_output"
        | "approval_review"
        | "dispatch_payload"
        | "loss_classification";
      guardrail_severity: "info" | "warning" | "blocker";
    };
    CompositeTypes: Record<string, never>;
  };
};

/* ---- Convenience helpers (mirror the Supabase generated helpers) ---- */

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
