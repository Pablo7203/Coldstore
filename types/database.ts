export type Json =
  string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      credit_accounts: {
        Row: {
          customer_id: string;
          credit_limit: number;
          current_balance: number;
          status: Database["public"]["Enums"]["credit_account_status"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          customer_id: string;
          credit_limit: number;
          current_balance?: number;
          status?: Database["public"]["Enums"]["credit_account_status"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          customer_id?: string;
          credit_limit?: number;
          current_balance?: number;
          status?: Database["public"]["Enums"]["credit_account_status"];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      credit_transactions: {
        Row: {
          id: string;
          customer_id: string;
          transaction_type: Database["public"]["Enums"]["credit_transaction_type"];
          amount: number;
          sale_id: string | null;
          payment_id: string | null;
          client_operation_id: string;
          recorded_by: string | null;
          balance_after: number;
          available_after: number;
          occurred_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          transaction_type: Database["public"]["Enums"]["credit_transaction_type"];
          amount: number;
          sale_id?: string | null;
          payment_id?: string | null;
          client_operation_id: string;
          recorded_by?: string | null;
          balance_after: number;
          available_after: number;
          occurred_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          transaction_type?: Database["public"]["Enums"]["credit_transaction_type"];
          amount?: number;
          sale_id?: string | null;
          payment_id?: string | null;
          client_operation_id?: string;
          recorded_by?: string | null;
          balance_after?: number;
          available_after?: number;
          occurred_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      delivery_settings: {
        Row: {
          singleton: boolean;
          flat_fee: number;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          singleton?: boolean;
          flat_fee: number;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          singleton?: boolean;
          flat_fee?: number;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          sale_id: string | null;
          order_id: string | null;
          customer_id: string | null;
          method: Database["public"]["Enums"]["payment_method"];
          amount: number;
          status: Database["public"]["Enums"]["payment_status"];
          provider: string | null;
          provider_reference: string | null;
          client_operation_id: string | null;
          recorded_by: string | null;
          occurred_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          sale_id?: string | null;
          order_id?: string | null;
          customer_id?: string | null;
          method: Database["public"]["Enums"]["payment_method"];
          amount: number;
          status?: Database["public"]["Enums"]["payment_status"];
          provider?: string | null;
          provider_reference?: string | null;
          client_operation_id?: string | null;
          recorded_by?: string | null;
          occurred_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          sale_id?: string | null;
          order_id?: string | null;
          customer_id?: string | null;
          method?: Database["public"]["Enums"]["payment_method"];
          amount?: number;
          status?: Database["public"]["Enums"]["payment_status"];
          provider?: string | null;
          provider_reference?: string | null;
          client_operation_id?: string | null;
          recorded_by?: string | null;
          occurred_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      offline_pos_operations: {
        Row: {
          id: string;
          cashier_user_id: string;
          cashier_name_snapshot: string;
          client_operation_id: string;
          occurred_at: string;
          items_snapshot: Json;
          status: string;
          conflict_reasons: Json;
          sale_id: string | null;
          reviewed_by: string | null;
          review_note: string | null;
          created_at: string;
          synced_at: string | null;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          cashier_user_id: string;
          cashier_name_snapshot: string;
          client_operation_id: string;
          occurred_at: string;
          items_snapshot: Json;
          status?: string;
          conflict_reasons?: Json;
          sale_id?: string | null;
          reviewed_by?: string | null;
          review_note?: string | null;
          created_at?: string;
          synced_at?: string | null;
          resolved_at?: string | null;
        };
        Update: {
          id?: string;
          cashier_user_id?: string;
          cashier_name_snapshot?: string;
          client_operation_id?: string;
          occurred_at?: string;
          items_snapshot?: Json;
          status?: string;
          conflict_reasons?: Json;
          sale_id?: string | null;
          reviewed_by?: string | null;
          review_note?: string | null;
          created_at?: string;
          synced_at?: string | null;
          resolved_at?: string | null;
        };
        Relationships: [];
      };
      sales: {
        Row: {
          id: string;
          receipt_number: string;
          customer_id: string | null;
          cashier_user_id: string;
          channel: Database["public"]["Enums"]["sale_channel"];
          status: Database["public"]["Enums"]["sale_status"];
          subtotal: number;
          total: number;
          client_operation_id: string;
          occurred_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          receipt_number: string;
          customer_id?: string | null;
          cashier_user_id: string;
          channel?: Database["public"]["Enums"]["sale_channel"];
          status?: Database["public"]["Enums"]["sale_status"];
          subtotal: number;
          total: number;
          client_operation_id: string;
          occurred_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          receipt_number?: string;
          customer_id?: string | null;
          cashier_user_id?: string;
          channel?: Database["public"]["Enums"]["sale_channel"];
          status?: Database["public"]["Enums"]["sale_status"];
          subtotal?: number;
          total?: number;
          client_operation_id?: string;
          occurred_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      sale_items: {
        Row: {
          id: string;
          sale_id: string;
          product_id: string;
          product_name_snapshot: string;
          sku_snapshot: string | null;
          unit_price: number;
          quantity: number;
          line_total: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          sale_id: string;
          product_id: string;
          product_name_snapshot: string;
          sku_snapshot?: string | null;
          unit_price: number;
          quantity: number;
          line_total: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          sale_id?: string;
          product_id?: string;
          product_name_snapshot?: string;
          sku_snapshot?: string | null;
          unit_price?: number;
          quantity?: number;
          line_total?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_user_id: string | null;
          created_at: string;
          details: Json;
          entity_id: string;
          entity_type: string;
          id: number;
        };
        Insert: {
          action: string;
          actor_user_id?: string | null;
          created_at?: string;
          details?: Json;
          entity_id: string;
          entity_type: string;
          id?: never;
        };
        Update: {
          action?: string;
          actor_user_id?: string | null;
          created_at?: string;
          details?: Json;
          entity_id?: string;
          entity_type?: string;
          id?: never;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          slug: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          auth_user_id: string | null;
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          notes: string | null;
          phone: string;
          status: Database["public"]["Enums"]["customer_status"];
          updated_at: string;
        };
        Insert: {
          auth_user_id?: string | null;
          created_at?: string;
          email?: string | null;
          full_name: string;
          id?: string;
          notes?: string | null;
          phone: string;
          status?: Database["public"]["Enums"]["customer_status"];
          updated_at?: string;
        };
        Update: {
          auth_user_id?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          notes?: string | null;
          phone?: string;
          status?: Database["public"]["Enums"]["customer_status"];
          updated_at?: string;
        };
        Relationships: [];
      };
      inventory_balances: {
        Row: {
          product_id: string;
          quantity: number;
          updated_at: string;
        };
        Insert: {
          product_id: string;
          quantity?: number;
          updated_at?: string;
        };
        Update: {
          product_id?: string;
          quantity?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_balances_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: true;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          id: string;
          order_number: string;
          customer_id: string;
          status: Database["public"]["Enums"]["order_status"];
          fulfillment_method: "pickup" | "delivery";
          payment_method: Database["public"]["Enums"]["payment_method"];
          payment_status: "unpaid" | "pending" | "paid" | "failed";
          delivery_address: string | null;
          delivery_area: string | null;
          delivery_instructions: string | null;
          delivery_fee: number | null;
          delivery_fee_accepted_at: string | null;
          delivery_stage: Database["public"]["Enums"]["delivery_stage"];
          delivery_tracking_reference: string | null;
          delivery_estimated_at: string | null;
          delivery_updated_at: string | null;
          subtotal: number;
          total: number;
          client_operation_id: string;
          reservation_expires_at: string;
          placed_at: string;
          fulfilled_at: string | null;
          cancelled_at: string | null;
          sale_id: string | null;
          fulfillment_client_operation_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_number: string;
          customer_id: string;
          status?: Database["public"]["Enums"]["order_status"];
          fulfillment_method?: "pickup" | "delivery";
          payment_method?: Database["public"]["Enums"]["payment_method"];
          payment_status?: "unpaid" | "pending" | "paid" | "failed";
          delivery_address?: string | null;
          delivery_area?: string | null;
          delivery_instructions?: string | null;
          delivery_fee?: number | null;
          delivery_fee_accepted_at?: string | null;
          delivery_stage?: Database["public"]["Enums"]["delivery_stage"];
          delivery_tracking_reference?: string | null;
          delivery_estimated_at?: string | null;
          delivery_updated_at?: string | null;
          subtotal: number;
          total: number;
          client_operation_id: string;
          reservation_expires_at: string;
          placed_at?: string;
          fulfilled_at?: string | null;
          cancelled_at?: string | null;
          sale_id?: string | null;
          fulfillment_client_operation_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_number?: string;
          customer_id?: string;
          status?: Database["public"]["Enums"]["order_status"];
          fulfillment_method?: "pickup" | "delivery";
          payment_method?: Database["public"]["Enums"]["payment_method"];
          payment_status?: "unpaid" | "pending" | "paid" | "failed";
          delivery_address?: string | null;
          delivery_area?: string | null;
          delivery_instructions?: string | null;
          delivery_fee?: number | null;
          delivery_fee_accepted_at?: string | null;
          delivery_stage?: Database["public"]["Enums"]["delivery_stage"];
          delivery_tracking_reference?: string | null;
          delivery_estimated_at?: string | null;
          delivery_updated_at?: string | null;
          subtotal?: number;
          total?: number;
          client_operation_id?: string;
          reservation_expires_at?: string;
          placed_at?: string;
          fulfilled_at?: string | null;
          cancelled_at?: string | null;
          sale_id?: string | null;
          fulfillment_client_operation_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          product_name_snapshot: string;
          sku_snapshot: string | null;
          unit_price: number;
          quantity: number;
          line_total: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id: string;
          product_name_snapshot: string;
          sku_snapshot?: string | null;
          unit_price: number;
          quantity: number;
          line_total: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string;
          product_name_snapshot?: string;
          sku_snapshot?: string | null;
          unit_price?: number;
          quantity?: number;
          line_total?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      order_delivery_events: {
        Row: {
          id: string;
          order_id: string;
          stage: Database["public"]["Enums"]["delivery_stage"];
          message: string;
          actor_user_id: string | null;
          idempotency_key: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          stage: Database["public"]["Enums"]["delivery_stage"];
          message: string;
          actor_user_id?: string | null;
          idempotency_key?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          stage?: Database["public"]["Enums"]["delivery_stage"];
          message?: string;
          actor_user_id?: string | null;
          idempotency_key?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      permissions: {
        Row: {
          description: string;
          permission_key: string;
        };
        Insert: {
          description: string;
          permission_key: string;
        };
        Update: {
          description?: string;
          permission_key?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          barcode: string | null;
          category_id: string;
          cost_price: number | null;
          created_at: string;
          description: string | null;
          id: string;
          image_path: string | null;
          is_active: boolean;
          name: string;
          reorder_level: number;
          selling_price: number;
          sku: string | null;
          updated_at: string;
        };
        Insert: {
          barcode?: string | null;
          category_id: string;
          cost_price?: number | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          image_path?: string | null;
          is_active?: boolean;
          name: string;
          reorder_level?: number;
          selling_price: number;
          sku?: string | null;
          updated_at?: string;
        };
        Update: {
          barcode?: string | null;
          category_id?: string;
          cost_price?: number | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          image_path?: string | null;
          is_active?: boolean;
          name?: string;
          reorder_level?: number;
          selling_price?: number;
          sku?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      role_permissions: {
        Row: {
          permission_key: string;
          role: Database["public"]["Enums"]["staff_role"];
        };
        Insert: {
          permission_key: string;
          role: Database["public"]["Enums"]["staff_role"];
        };
        Update: {
          permission_key?: string;
          role?: Database["public"]["Enums"]["staff_role"];
        };
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey";
            columns: ["permission_key"];
            isOneToOne: false;
            referencedRelation: "permissions";
            referencedColumns: ["permission_key"];
          },
        ];
      };
      staff_profile_audit: {
        Row: {
          actor_user_id: string | null;
          created_at: string;
          event_type: string;
          id: number;
          new_is_active: boolean | null;
          new_role: Database["public"]["Enums"]["staff_role"] | null;
          old_is_active: boolean | null;
          old_role: Database["public"]["Enums"]["staff_role"] | null;
          staff_user_id: string;
        };
        Insert: {
          actor_user_id?: string | null;
          created_at?: string;
          event_type: string;
          id?: never;
          new_is_active?: boolean | null;
          new_role?: Database["public"]["Enums"]["staff_role"] | null;
          old_is_active?: boolean | null;
          old_role?: Database["public"]["Enums"]["staff_role"] | null;
          staff_user_id: string;
        };
        Update: {
          actor_user_id?: string | null;
          created_at?: string;
          event_type?: string;
          id?: never;
          new_is_active?: boolean | null;
          new_role?: Database["public"]["Enums"]["staff_role"] | null;
          old_is_active?: boolean | null;
          old_role?: Database["public"]["Enums"]["staff_role"] | null;
          staff_user_id?: string;
        };
        Relationships: [];
      };
      staff_profiles: {
        Row: {
          created_at: string;
          full_name: string;
          is_active: boolean;
          phone: string | null;
          role: Database["public"]["Enums"]["staff_role"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          full_name: string;
          is_active?: boolean;
          phone?: string | null;
          role: Database["public"]["Enums"]["staff_role"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          full_name?: string;
          is_active?: boolean;
          phone?: string | null;
          role?: Database["public"]["Enums"]["staff_role"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      stock_movements: {
        Row: {
          actor_name: string;
          actor_user_id: string | null;
          client_operation_id: string | null;
          created_at: string;
          id: string;
          movement_type: Database["public"]["Enums"]["stock_movement_type"];
          occurred_at: string;
          product_id: string;
          quantity_delta: number;
          reason: string | null;
          reference_id: string | null;
          reference_type: string | null;
        };
        Insert: {
          actor_name: string;
          actor_user_id?: string | null;
          client_operation_id?: string | null;
          created_at?: string;
          id?: string;
          movement_type: Database["public"]["Enums"]["stock_movement_type"];
          occurred_at?: string;
          product_id: string;
          quantity_delta: number;
          reason?: string | null;
          reference_id?: string | null;
          reference_type?: string | null;
        };
        Update: {
          actor_name?: string;
          actor_user_id?: string | null;
          client_operation_id?: string | null;
          created_at?: string;
          id?: string;
          movement_type?: Database["public"]["Enums"]["stock_movement_type"];
          occurred_at?: string;
          product_id?: string;
          quantity_delta?: number;
          reason?: string | null;
          reference_id?: string | null;
          reference_type?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      available_credit: {
        Args: {
          p_credit_limit: number;
          p_current_balance: number;
          p_status: Database["public"]["Enums"]["credit_account_status"];
        };
        Returns: number;
      };
      complete_pos_sale: {
        Args: {
          p_client_operation_id: string;
          p_items: Json;
          p_payment_method: Database["public"]["Enums"]["payment_method"];
          p_customer_id?: string;
          p_momo_reference?: string;
        };
        Returns: {
          sale_id: string;
          receipt_number: string;
          subtotal: number;
          total: number;
          occurred_at: string;
        }[];
      };
      get_offline_pos_catalog: {
        Args: never;
        Returns: {
          id: string;
          name: string;
          sku: string | null;
          barcode: string | null;
          selling_price: number;
          available_stock: number;
          reorder_level: number;
          updated_at: string;
        }[];
      };
      sync_offline_pos_sale: {
        Args: {
          p_cashier_user_id: string;
          p_client_operation_id: string;
          p_occurred_at: string;
          p_items: Json;
        };
        Returns: {
          operation_status: string;
          synced_sale_id: string | null;
          synced_receipt_number: string | null;
          conflicts: Json;
        }[];
      };
      resolve_offline_pos_operation: {
        Args: {
          p_operation_id: string;
          p_resolution: string;
          p_note: string;
        };
        Returns: {
          operation_status: string;
          resolved_sale_id: string | null;
          resolved_receipt_number: string | null;
        }[];
      };
      submit_customer_order: {
        Args: { p_client_operation_id: string; p_items: Json };
        Returns: {
          order_id: string;
          order_number: string;
          status: Database["public"]["Enums"]["order_status"];
          subtotal: number;
          total: number;
          reservation_expires_at: string;
          placed_at: string;
        }[];
      };
      expire_customer_order_reservations: {
        Args: never;
        Returns: number;
      };
      submit_customer_delivery_order: {
        Args: {
          p_client_operation_id: string;
          p_items: Json;
          p_delivery_address: string;
          p_delivery_area: string;
          p_expected_delivery_fee: number;
          p_delivery_instructions?: string | null;
        };
        Returns: {
          order_id: string;
          order_number: string;
          status: Database["public"]["Enums"]["order_status"];
          subtotal: number;
          total: number;
          reservation_expires_at: string;
          placed_at: string;
          delivery_stage: Database["public"]["Enums"]["delivery_stage"];
          delivery_fee: number | null;
        }[];
      };
      set_delivery_rate: {
        Args: { p_flat_fee: number };
        Returns: number;
      };
      start_paystack_order_payment: {
        Args: { p_order_id: string };
        Returns: {
          reference: string;
          amount: number;
          currency: string;
          customer_email: string;
          order_number: string;
          authorization_url: string | null;
        }[];
      };
      lookup_paystack_order_attempt: {
        Args: { p_reference: string };
        Returns: {
          order_id: string;
          amount: number;
          currency: string;
          customer_email: string;
          status: string;
        }[];
      };
      save_paystack_authorization_url: {
        Args: { p_reference: string; p_authorization_url: string };
        Returns: undefined;
      };
      confirm_paystack_order_payment: {
        Args: { p_reference: string; p_amount_minor: number; p_currency: string };
        Returns: { order_id: string; order_number: string }[];
      };
      fail_paystack_order_attempt: {
        Args: { p_reference: string };
        Returns: undefined;
      };
      advance_customer_delivery: {
        Args: {
          p_order_id: string;
          p_next_stage: Database["public"]["Enums"]["delivery_stage"];
          p_tracking_reference?: string | null;
          p_estimated_at?: string | null;
        };
        Returns: Database["public"]["Enums"]["delivery_stage"];
      };
      complete_customer_delivery: {
        Args: { p_order_id: string };
        Returns: {
          sale_id: string;
          receipt_number: string;
          subtotal: number;
          total: number;
          payment_method: Database["public"]["Enums"]["payment_method"];
        }[];
      };
      mark_order_ready: {
        Args: { p_order_id: string };
        Returns: Database["public"]["Enums"]["order_status"];
      };
      fulfil_customer_order: {
        Args: {
          p_order_id: string;
          p_client_operation_id: string;
          p_payment_method: Database["public"]["Enums"]["payment_method"];
          p_momo_reference?: string | null;
        };
        Returns: {
          sale_id: string;
          receipt_number: string;
          total: number;
          payment_method: Database["public"]["Enums"]["payment_method"];
        }[];
      };
      get_pos_sale: {
        Args: { p_sale_id: string };
        Returns: {
          id: string;
          receipt_number: string;
          customer_id: string | null;
          customer_name: string | null;
          cashier_user_id: string;
          cashier_name: string;
          status: Database["public"]["Enums"]["sale_status"];
          subtotal: number;
          total: number;
          payment_method: Database["public"]["Enums"]["payment_method"];
          payment_status: Database["public"]["Enums"]["payment_status"];
          provider_reference: string | null;
          credit_balance_after: number | null;
          credit_available_after: number | null;
          occurred_at: string;
          item_id: string;
          product_id: string;
          product_name: string;
          sku: string | null;
          unit_price: number;
          quantity: number;
          line_total: number;
        }[];
      };
      manage_credit_account: {
        Args: {
          p_customer_id: string;
          p_credit_limit: number;
          p_status: Database["public"]["Enums"]["credit_account_status"];
        };
        Returns: {
          customer_id: string;
          credit_limit: number;
          current_balance: number;
          available_credit: number;
          status: Database["public"]["Enums"]["credit_account_status"];
          updated_at: string;
        }[];
      };
      get_credit_account: {
        Args: { p_customer_id: string };
        Returns: {
          customer_id: string;
          customer_name: string;
          customer_phone: string;
          customer_status: Database["public"]["Enums"]["customer_status"];
          credit_limit: number;
          current_balance: number;
          available_credit: number;
          status: Database["public"]["Enums"]["credit_account_status"];
          updated_at: string;
        }[];
      };
      search_credit_accounts: {
        Args: { p_query?: string; p_limit?: number };
        Returns: {
          customer_id: string;
          customer_name: string;
          customer_phone: string;
          customer_status: Database["public"]["Enums"]["customer_status"];
          credit_limit: number;
          current_balance: number;
          available_credit: number;
          status: Database["public"]["Enums"]["credit_account_status"];
          updated_at: string;
        }[];
      };
      get_credit_history: {
        Args: { p_customer_id: string; p_limit?: number; p_offset?: number };
        Returns: {
          id: string;
          transaction_type: Database["public"]["Enums"]["credit_transaction_type"];
          amount: number;
          balance_after: number;
          available_after: number;
          occurred_at: string;
          sale_id: string | null;
          receipt_number: string | null;
          payment_id: string | null;
          payment_method: Database["public"]["Enums"]["payment_method"] | null;
          provider_reference: string | null;
          recorded_by: string | null;
          recorded_by_name: string | null;
        }[];
      };
      record_credit_repayment: {
        Args: {
          p_customer_id: string;
          p_amount: number;
          p_payment_method: Database["public"]["Enums"]["payment_method"];
          p_client_operation_id: string;
          p_provider_reference?: string | null;
        };
        Returns: {
          payment_id: string;
          transaction_id: string;
          customer_id: string;
          customer_name: string;
          amount: number;
          payment_method: Database["public"]["Enums"]["payment_method"];
          provider_reference: string | null;
          remaining_balance: number;
          remaining_available: number;
          available_after: number;
          recorded_by_name: string;
          occurred_at: string;
        }[];
      };
      get_credit_repayment: {
        Args: { p_payment_id: string };
        Returns: {
          payment_id: string;
          customer_id: string;
          customer_name: string;
          amount: number;
          payment_method: Database["public"]["Enums"]["payment_method"];
          provider_reference: string | null;
          balance_after: number;
          available_after: number;
          recorded_by_name: string | null;
          occurred_at: string;
        }[];
      };
      search_customers: {
        Args: { p_query?: string; p_limit?: number };
        Returns: {
          id: string;
          full_name: string;
          phone: string;
          email: string | null;
          status: Database["public"]["Enums"]["customer_status"];
        }[];
      };
      search_pos_sales: {
        Args: { p_query?: string; p_limit?: number; p_offset?: number };
        Returns: {
          id: string;
          receipt_number: string;
          occurred_at: string;
          cashier_name: string;
          customer_name: string | null;
          payment_method: Database["public"]["Enums"]["payment_method"];
          total: number;
          status: Database["public"]["Enums"]["sale_status"];
        }[];
      };
      assign_staff_profile: {
        Args: {
          active?: boolean;
          assigned_role: Database["public"]["Enums"]["staff_role"];
          profile_name: string;
          profile_phone: string;
          target_user_id: string;
        };
        Returns: undefined;
      };
      current_staff_role: {
        Args: never;
        Returns: Database["public"]["Enums"]["staff_role"];
      };
      get_inventory_summary: {
        Args: never;
        Returns: {
          active_products: number;
          in_stock: number;
          initialized_products: number;
          low_stock: number;
          out_of_stock: number;
        }[];
      };
      has_permission: {
        Args: { requested_permission: string };
        Returns: boolean;
      };
      is_active_staff: { Args: never; Returns: boolean };
      normalize_ghana_phone: { Args: { raw_phone: string }; Returns: string };
      record_stock_movement: {
        Args: {
          p_client_operation_id?: string;
          p_movement_type: Database["public"]["Enums"]["stock_movement_type"];
          p_product_id: string;
          p_quantity: number;
          p_reason?: string;
          p_reference_id?: string;
          p_reference_type?: string;
        };
        Returns: string;
      };
      get_orderable_catalog: {
        Args: { p_category_id?: string | null; p_limit?: number; p_query?: string };
        Returns: {
          product_id: string;
          category_id: string;
          category_name: string;
          name: string;
          description: string | null;
          selling_price: number;
          image_path: string | null;
          available_to_order: number;
        }[];
      };
      search_products: {
        Args: {
          p_active?: boolean;
          p_category_id?: string;
          p_limit?: number;
          p_offset?: number;
          p_query?: string;
        };
        Returns: {
          barcode: string;
          category_id: string;
          category_name: string;
          cost_price: number;
          created_at: string;
          description: string;
          id: string;
          is_active: boolean;
          name: string;
          quantity: number;
          reorder_level: number;
          selling_price: number;
          sku: string;
          total_count: number;
          updated_at: string;
        }[];
      };
      search_stock_movements: {
        Args: { p_limit?: number; p_offset?: number; p_product_id?: string };
        Returns: {
          actor_name: string;
          actor_user_id: string;
          id: string;
          movement_type: Database["public"]["Enums"]["stock_movement_type"];
          occurred_at: string;
          product_id: string;
          product_name: string;
          quantity_delta: number;
          reason: string;
          reference_type: string;
          sku: string;
          total_count: number;
        }[];
      };
    };
    Enums: {
      customer_status: "active" | "inactive";
      order_status:
        | "pending"
        | "confirmed"
        | "preparing"
        | "ready"
        | "completed"
        | "cancelled"
        | "expired";
      delivery_stage:
        | "not_applicable"
        | "awaiting_fee"
        | "fee_quoted"
        | "confirmed"
        | "preparing"
        | "packed"
        | "out_for_delivery"
        | "delivered"
        | "cancelled";
      credit_account_status: "active" | "suspended";
      credit_transaction_type: "credit_sale" | "repayment" | "adjustment" | "reversal";
      sale_channel: "pos" | "order_fulfilment";
      payment_method: "cash" | "external_momo" | "paystack" | "credit";
      payment_status: "recorded" | "reversed" | "outstanding";
      sale_status: "completed" | "voided" | "reversed";
      staff_role: "admin" | "manager" | "cashier" | "stock_assistant";
      stock_movement_type:
        | "opening_stock"
        | "receipt"
        | "wastage"
        | "damage"
        | "adjustment_in"
        | "adjustment_out"
        | "sale"
        | "customer_return"
        | "reversal";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      customer_status: ["active", "inactive"],
      staff_role: ["admin", "manager", "cashier", "stock_assistant"],
      stock_movement_type: [
        "opening_stock",
        "receipt",
        "wastage",
        "damage",
        "adjustment_in",
        "adjustment_out",
        "sale",
        "customer_return",
        "reversal",
      ],
    },
  },
} as const;
