import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Tool, ToolSchema } from "@modelcontextprotocol/sdk/types.js";
import { executeJxa } from "../applescript/execute.js";
import {
  escapeStringForJXA,
  isJXASafeString,
} from "../utils/escapeString.js";
import { getRecordLookupHelpers } from "../utils/jxaHelpers.js";

const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

const GetCustomMetaDataSchema = z
  .object({
    uuid: z.string().describe("The UUID of the record to get custom metadata from"),
    keys: z
      .array(z.string())
      .optional()
      .describe("Array of specific metadata keys to retrieve. If not provided, attempts to get common metadata keys."),
  })
  .strict();

type GetCustomMetaDataInput = z.infer<typeof GetCustomMetaDataSchema>;

interface GetCustomMetaDataResult {
  success: boolean;
  error?: string;
  uuid?: string;
  name?: string;
  customMetaData?: Record<string, any>;
}

const getCustomMetaData = async (
  input: GetCustomMetaDataInput
): Promise<GetCustomMetaDataResult> => {
  const { uuid, keys } = input;

  // Validate string inputs
  if (!isJXASafeString(uuid)) {
    return { success: false, error: "UUID contains invalid characters" };
  }

  // Common metadata keys to try if none specified
  const defaultKeys = keys || [
    "Country", "country", "Year", "year", "Author", "author", 
    "Category", "Type", "type", "Organization", "organisation"
  ];

  const script = `
    (() => {
      const theApp = Application("DEVONthink");
      theApp.includeStandardAdditions = true;
      
      // Inject helper functions
      ${getRecordLookupHelpers()}
      
      try {
        // Use the unified lookup function
        const lookupOptions = {};
        lookupOptions["uuid"] = ${uuid ? `"${escapeStringForJXA(uuid)}"` : "null"};
        
        const lookupResult = getRecord(theApp, lookupOptions);
        
        if (!lookupResult.record) {
          const errorResponse = {};
          errorResponse["success"] = false;
          errorResponse["error"] = "Record with UUID " + (${uuid ? `"${escapeStringForJXA(uuid)}"` : "null"} || "unknown") + " not found";
          return JSON.stringify(errorResponse);
        }
        
        const record = lookupResult.record;
        const keysToCheck = ${JSON.stringify(defaultKeys)};
        
        const customMetaData = {};
        
        // Get custom metadata for each key
        for (const key of keysToCheck) {
          try {
            const value = theApp.getCustomMetaData({for: key, from: record});
            if (value !== null && value !== undefined) {
              customMetaData[key] = value;
            }
          } catch (metadataError) {
            // Silently skip keys that don't exist or cause errors
            console.log("Info: No metadata for key '" + key + "': " + metadataError.toString());
          }
        }
        
        // Build success response
        const response = {};
        response["success"] = true;
        response["uuid"] = record.uuid();
        response["name"] = record.name();
        response["customMetaData"] = customMetaData;
        
        return JSON.stringify(response);
      } catch (error) {
        const errorResponse = {};
        errorResponse["success"] = false;
        errorResponse["error"] = error.toString();
        return JSON.stringify(errorResponse);
      }
    })();
  `;

  return await executeJxa<GetCustomMetaDataResult>(script);
};

export const getCustomMetaDataTool: Tool = {
  name: "get_custom_metadata",
  description: "Retrieves custom metadata (custom columns) from a DEVONthink record. This allows you to read custom fields like Year, Country, Author, etc. that appear as columns in DEVONthink's interface. Since UUIDs are globally unique across all databases, only the UUID is required to identify the record.",
  inputSchema: zodToJsonSchema(GetCustomMetaDataSchema) as ToolInput,
  run: getCustomMetaData,
};